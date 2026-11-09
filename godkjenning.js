/* Roller og godkjenning.
   - Hovedadmin: har en nøkkel som kan skrive til håndbok-repoet. Publiserer direkte og godkjenner forslag.
   - Redaktør: har en nøkkel som BARE har tilgang til innboks-repoet. Sender forslag til godkjenning.
   GitHub håndhever tilgangen: uten hovedadmin-nøkkelen kan ingen publisere i håndboken.

   Innboks-repoet (privat) har denne strukturen:
     venter/<forslag-id>/forslag.json        forslag som venter
     venter/<forslag-id>/bilder/<navn>       bilder som hører til forslaget
     behandlet/<forslag-id>/forslag.json     avgjorte forslag (godkjent / avvist / erstattet) med notat
   Alt i innboksen behandles som upålitelig input og kontrolleres før noe kan godkjennes. */
(() => {
  'use strict';

  const E = window.HBE;
  const { esc, $, toast, clone, root, hooks, gh, inbox, GhError, ghFetch, ghRepoUrl, ghFilePath, b64enc, b64dec } = E;

  const NAME_KEY = 'hbe:name';
  const SUBS_KEY = 'hbe:subs';          // mine innsendinger (redaktør)
  const APPLIED_KEY = 'hbe:applied';    // godkjente forslag som venter på publisering (admin)
  const ID_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;
  const SUBID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;
  const IMG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(jpg|png|gif)$/;
  const OWNER_RE = /^[A-Za-z0-9._-]{1,100}$/;
  const TYPE_LABEL = { ny: 'Ny artikkel', endring: 'Endring', sletting: 'Sletting' };
  const STATUS_LABEL = { venter: 'Venter på godkjenning', godkjent: 'Godkjent', avvist: 'Avvist', erstattet: 'Erstattet av nyere forslag', ukjent: 'Ukjent status' };

  const jget = (k, d) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch (e) { return d; } };
  const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignorer */ } };
  const fmtDT = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  const jsonText = (o) => JSON.stringify(o, null, 2) + '\n';

  /* ---------- innboks-API ---------- */
  const P = (c, path) => ghFilePath(c, path);

  async function listDir(c, dir) {
    try {
      const r = await ghFetch(c, P(c, dir));
      return Array.isArray(r) ? r : [];
    } catch (e) { if (e.status === 404) return []; throw e; }
  }
  async function getJson(c, path) {
    const r = await ghFetch(c, P(c, path));
    if (Array.isArray(r) || !r.content) throw new GhError(0, 'Kunne ikke lese ' + path);
    let data;
    try { data = JSON.parse(b64dec(r.content)); } catch (e) { throw new GhError(0, 'Ugyldig forslag'); }
    return { sha: r.sha, data };
  }
  function putText(c, path, text, message, sha) {
    const body = { message, content: b64enc(text) };
    if (sha) body.sha = sha;
    return ghFetch(c, P(c, path), { method: 'PUT', body: JSON.stringify(body) });
  }
  const delFile = (c, path, sha, message) => ghFetch(c, P(c, path), { method: 'DELETE', body: JSON.stringify({ message, sha }) });

  async function sniff(blob) {
    const b = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpg';
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'png';
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'gif';
    return null;
  }

  // Flytter et forslag fra venter/ til behandlet/ og rydder opp. Historikken ligger igjen i git.
  async function settle(c, id, rec, status, note) {
    const out = {
      versjon: 1, id, type: rec.type, articleId: rec.articleId, title: rec.title,
      submittedBy: rec.submittedBy, submittedAt: rec.submittedAt, issue: rec.issue || null,
      status, note: String(note || '').slice(0, 500), decidedAt: new Date().toISOString()
    };
    let sha;
    try { sha = (await getJson(c, 'behandlet/' + id + '/forslag.json')).sha; } catch (e) { if (e.status !== 404) throw e; }
    await putText(c, 'behandlet/' + id + '/forslag.json', jsonText(out), 'Behandlet (' + status + '): ' + id, sha);
    const files = [];
    (await listDir(c, 'venter/' + id)).forEach((f) => { if (f.type === 'file') files.push(f); });
    (await listDir(c, 'venter/' + id + '/bilder')).forEach((f) => { if (f.type === 'file') files.push(f); });
    for (const f of files) await delFile(c, f.path, f.sha, 'Rydd opp ' + id);
    if (Number.isInteger(rec.issue)) {
      try {
        await ghFetch(c, ghRepoUrl(c) + '/issues/' + rec.issue, {
          method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: status === 'godkjent' ? 'completed' : 'not_planned' })
        });
      } catch (e) { /* varsler er valgfrie */ }
    }
  }

  async function getStatus(c, id) {
    try { await getJson(c, 'venter/' + id + '/forslag.json'); return { status: 'venter' }; } catch (e) { if (e.status !== 404) throw e; }
    try {
      const r = await getJson(c, 'behandlet/' + id + '/forslag.json');
      const s = ['godkjent', 'avvist', 'erstattet'].includes(r.data.status) ? r.data.status : 'ukjent';
      return { status: s, note: typeof r.data.note === 'string' ? r.data.note.slice(0, 500) : '' };
    } catch (e) { if (e.status === 404) return { status: 'ukjent' }; throw e; }
  }

  /* ---------- redaktør: send til godkjenning ---------- */
  const subs = { get: () => jget(SUBS_KEY, []), set: (v) => jset(SUBS_KEY, v.slice(-40)) };

  // Finner endringene i utkastet. `all` er alle endringer, `out` er de som ikke allerede er sendt.
  function computeOutgoing() {
    const base = E.base, draft = E.draft;
    const bm = new Map(base.articles.map((a) => [a.id, a]));
    const deleted = new Set(base.articles.filter((b) => !draft.articles.some((a) => a.id === b.id)).map((b) => b.id));
    // Når en artikkel slettes, fjernes den også fra «Se også» hos andre. Det regnes ikke som en egen endring.
    const core = (a) => JSON.stringify([a.title, a.category, a.summary, a.tags || [], (a.related || []).filter((r) => !deleted.has(r)), a.body]);
    const all = [];
    draft.articles.forEach((a) => {
      const b = bm.get(a.id);
      const sig = E.contentSig(a);
      if (!b) all.push({ type: 'ny', article: a, sig });
      else if (core(b) !== core(a)) all.push({ type: 'endring', article: a, sig, baseSig: E.contentSig(b) });
    });
    base.articles.forEach((b) => {
      if (deleted.has(b.id)) all.push({ type: 'sletting', article: b, sig: 'sletting', baseSig: E.contentSig(b) });
    });
    const sent = subs.get();
    const out = all.filter((o) => !sent.some((s) => s.articleId === o.article.id && s.sig === o.sig && s.status === 'venter'));
    return { all, out };
  }

  hooks.rowBadge = (a) => {
    if (E.role() !== 'editor') return '';
    const sig = E.contentSig(a);
    return subs.get().some((s) => s.articleId === a.id && s.sig === sig && s.status === 'venter')
      ? '<span class="badge-wait">Sendt til godkjenning</span>' : '';
  };

  hooks.editorStatus = (c) => {
    const { all, out } = computeOutgoing();
    const sent = all.length - out.length;
    let html = '<p>Du er <strong>redaktør</strong>. Endringene dine kommer først ut i håndboken når hovedadmin har godkjent dem.</p>';
    if (out.length) html += `<p><strong>Klar til å sendes:</strong> ${out.length} ${out.length === 1 ? 'endring' : 'endringer'}.${sent ? ` ${sent} er allerede sendt.` : ''}</p>`;
    else if (sent) html += '<p>Alt du har endret er sendt og venter på godkjenning.</p>';
    else html += '<p>Ingen endringer ennå. Trykk «Ny artikkel» eller åpne en artikkel for å foreslå en endring.</p>';
    html += '<div class="ed-bar" style="margin:8px 0 0">'
      + (out.length ? '<button class="btn primary" id="send">📨 Send til godkjenning</button>' : '')
      + (c.total ? '<button class="btn danger" id="discard">Forkast endringer</button>' : '')
      + '</div></div><div id="mysubs">';
    return html;
  };

  let sending = false;
  async function sendForApproval() {
    if (sending) return;
    const c = inbox.cfg();
    if (!c) return renderInboxCfg();
    const { out } = computeOutgoing();
    if (!out.length) { toast('Ingenting nytt å sende.'); return; }
    let name = localStorage.getItem(NAME_KEY) || '';
    if (!name) {
      name = (prompt('Hva heter du? Navnet vises til den som godkjenner.') || '').trim().slice(0, 80);
      if (!name) { toast('Du må skrive navnet ditt for å sende inn.'); return; }
      try { localStorage.setItem(NAME_KEY, name); } catch (e) { /* ignorer */ }
    }
    if (!confirm('Sende ' + out.length + (out.length === 1 ? ' endring' : ' endringer') + ' til godkjenning?\n\n'
      + out.map((o) => '• ' + TYPE_LABEL[o.type] + ': ' + o.article.title).join('\n'))) return;

    sending = true;
    const btn = $('#send');
    if (btn) btn.disabled = true;
    let done = 0;
    try {
      for (const o of out) {
        if (btn) btn.textContent = 'Sender ' + (done + 1) + ' av ' + out.length + ' …';
        await submitOne(c, o, name);
        done++;
      }
      toast(done + (done === 1 ? ' endring er' : ' endringer er') + ' sendt til godkjenning. Du ser status under «Mine innsendinger».', 8000);
    } catch (e) {
      toast((done ? done + ' ble sendt, men ' : '') + E.ghMessage(e), 10000);
    } finally {
      sending = false;
      lastSubsFetch = 0;
      E.renderList();
    }
  }

  async function submitOne(c, o, name) {
    const a = o.article;
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const subId = stamp + '-' + E.slug(a.title).slice(0, 30).replace(/-+$/, '') + '-' + Math.random().toString(36).slice(2, 6);
    const names = o.type === 'sletting' ? [] : [...new Set(E.imageNames(a.body).map(E.imgName))].filter((n) => E.pending.has(n));

    // Bilder først, så forslaget aldri peker på bilder som mangler
    for (const n of names) {
      await E.ghPutBlob(c, 'venter/' + subId + '/bilder/' + n, E.pending.get(n).blob, 'Bilde til forslag ' + subId);
    }

    // Valgfritt varsel: en issue gir e-post til alle som følger innboks-repoet
    let issue = null;
    try {
      const r = await ghFetch(c, ghRepoUrl(c) + '/issues', {
        method: 'POST',
        body: JSON.stringify({
          title: TYPE_LABEL[o.type] + ': ' + a.title,
          body: 'Nytt forslag fra `' + name.replace(/`/g, '') + '`.\n\nÅpne håndbok-editoren og velg «Innboks» for å se gjennom og godkjenne.\n\nForslags-ID: `' + subId + '`'
        })
      });
      issue = r && Number.isInteger(r.number) ? r.number : null;
    } catch (e) { /* issues er ikke aktivert, eller nøkkelen mangler tilgang */ }

    const rec = {
      versjon: 1, id: subId, type: o.type, articleId: a.id, title: a.title,
      article: o.type === 'sletting' ? undefined : { id: a.id, title: a.title, category: a.category, summary: a.summary || '', tags: a.tags || [], related: a.related || [], body: a.body || '' },
      baseSig: o.baseSig || null, images: names, submittedBy: name, submittedAt: new Date().toISOString(), status: 'venter', issue
    };
    await putText(c, 'venter/' + subId + '/forslag.json', jsonText(rec), 'Forslag: ' + TYPE_LABEL[o.type] + ' ' + a.title);

    // Tidligere ventende forslag for samme artikkel erstattes av dette
    const list = subs.get();
    for (const old of list.filter((s) => s.articleId === a.id && s.status === 'venter')) {
      try {
        const r = await getJson(c, 'venter/' + old.subId + '/forslag.json');
        await settle(c, old.subId, r.data, 'erstattet', '');
      } catch (e) { /* kan allerede være behandlet */ }
      old.status = 'erstattet';
    }
    list.push({ subId, articleId: a.id, title: a.title, type: o.type, sig: o.sig, at: new Date().toISOString(), status: 'venter' });
    subs.set(list);
  }

  /* ---------- redaktør: mine innsendinger ---------- */
  let lastSubsFetch = 0, fetchingSubs = false;

  function renderMySubs() {
    const box = $('#mysubs');
    if (!box) return;
    const list = subs.get().slice().reverse();
    if (!list.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<h2 class="section-title">Mine innsendinger</h2><ul class="rows">' + list.map((s) => `
      <li class="row"><div class="row-main"><strong>${esc(s.title)}</strong>
        <div class="meta"><span class="tag">${esc(TYPE_LABEL[s.type] || s.type)}</span><span class="st st-${esc(s.status)}">${esc(STATUS_LABEL[s.status] || s.status)}</span><span>${esc(fmtDT(s.at))}</span></div>
        ${s.note ? `<p class="hint">Kommentar fra godkjenner: ${esc(s.note)}</p>` : ''}</div>
        <div class="row-actions">${s.status !== 'venter' ? `<button class="btn small" data-rm="${esc(s.subId)}">Fjern</button>` : ''}</div></li>`).join('') + '</ul>';
    box.querySelectorAll('[data-rm]').forEach((b) => {
      b.onclick = () => { subs.set(subs.get().filter((x) => x.subId !== b.dataset.rm)); renderMySubs(); };
    });
  }

  async function refreshMySubs() {
    renderMySubs();
    const c = inbox.cfg();
    if (!c || fetchingSubs || Date.now() - lastSubsFetch < 30000) return;
    fetchingSubs = true;
    lastSubsFetch = Date.now();
    try {
      const list = subs.get();
      let changed = false;
      for (const s of list.filter((x) => x.status === 'venter').slice(-15)) {
        try {
          const r = await getStatus(c, s.subId);
          if (r.status !== 'venter') { s.status = r.status; s.note = r.note || ''; changed = true; }
        } catch (e) { if (e.status) break; }
      }
      if (changed) subs.set(list);
    } finally { fetchingSubs = false; }
    renderMySubs();
  }

  /* ---------- admin: validering av forslag ---------- */
  const str = (v, max, required) => {
    if (typeof v !== 'string') { if (required) throw new Error('Mangler felt'); return ''; }
    if (v.length > max) throw new Error('Et felt er for langt');
    if (required && !v.trim()) throw new Error('Mangler felt');
    return v;
  };
  const arr = (v, maxItems, maxLen) => {
    if (!Array.isArray(v)) return [];
    return v.filter((x) => typeof x === 'string' && x.length <= maxLen).slice(0, maxItems);
  };

  // Alt fra innboksen sjekkes og renses. Bare kjente felt tas med videre.
  function cleanSub(d, id) {
    if (!d || typeof d !== 'object') throw new Error('Ugyldig forslag');
    if (!['ny', 'endring', 'sletting'].includes(d.type)) throw new Error('Ukjent type forslag');
    if (typeof d.articleId !== 'string' || !ID_RE.test(d.articleId)) throw new Error('Ugyldig artikkel-id');
    const out = {
      id, type: d.type, articleId: d.articleId, title: str(d.title, 200),
      submittedBy: str(d.submittedBy, 80), submittedAt: str(d.submittedAt, 40),
      baseSig: typeof d.baseSig === 'string' ? d.baseSig : null,
      issue: Number.isInteger(d.issue) ? d.issue : null, images: []
    };
    if (d.type !== 'sletting') {
      const a = d.article;
      if (!a || typeof a !== 'object' || a.id !== d.articleId) throw new Error('Forslaget har ingen gyldig artikkel');
      out.article = {
        id: a.id, title: str(a.title, 200, true), category: str(a.category, 80, true), summary: str(a.summary, 500),
        tags: arr(a.tags, 20, 40), related: arr(a.related, 50, 60).filter((r) => ID_RE.test(r)), body: str(a.body, 100000)
      };
      const uploaded = new Set(arr(d.images, 30, 100));
      out.images = [...new Set(E.imageNames(out.article.body).map(E.imgName))].filter((n) => uploaded.has(n));
      out.images.forEach((n) => { if (!IMG_RE.test(n)) throw new Error('Ugyldig bildenavn'); });
    }
    return out;
  }

  /* ---------- admin: innboks ---------- */
  const applied = { get: () => jget(APPLIED_KEY, []), set: (v) => jset(APPLIED_KEY, v) };
  const cache = { n: null, at: 0, busy: false };

  hooks.barHtml = () => (E.role() === 'admin' ? '<button class="btn" id="inboxBtn">📥 Innboks<span id="inboxN"></span></button>' : '');

  async function refreshInboxCount() {
    const el = $('#inboxN');
    if (!el) return;
    const show = () => { const el2 = $('#inboxN'); if (el2) el2.textContent = cache.n ? ' (' + cache.n + ')' : ''; };
    show();
    const c = inbox.cfg();
    if (!c || cache.busy || Date.now() - cache.at < 30000) return;
    cache.busy = true;
    try {
      const dirs = (await listDir(c, 'venter')).filter((x) => x.type === 'dir');
      const appliedIds = new Set(applied.get().map((x) => x.subId));
      cache.n = dirs.filter((x) => !appliedIds.has(x.name)).length;
      cache.at = Date.now();
    } catch (e) { /* offline eller ingen tilgang */ } finally { cache.busy = false; }
    show();
  }

  hooks.afterList = () => {
    if ($('#inboxBtn')) { $('#inboxBtn').onclick = renderInbox; refreshInboxCount(); }
    if ($('#send')) $('#send').onclick = sendForApproval;
    if ($('#mysubs')) refreshMySubs();
  };

  async function loadInbox(c) {
    const dirs = (await listDir(c, 'venter')).filter((x) => x.type === 'dir' && SUBID_RE.test(x.name)).map((x) => x.name).sort().slice(0, 60);
    return Promise.all(dirs.map(async (id) => {
      try { const r = await getJson(c, 'venter/' + id + '/forslag.json'); return { id, sha: r.sha, data: r.data }; }
      catch (e) { return { id, error: e.message || 'Kunne ikke lese forslaget' }; }
    }));
  }

  async function renderInbox() {
    const c = inbox.cfg();
    if (!c) { toast('Koble først til innboksen.'); return renderInboxCfg(); }
    root.innerHTML = '<div class="ed-bar"><button class="btn" id="back">← Tilbake</button></div><h1>Innboks</h1><p class="empty">Henter forslag …</p>';
    $('#back').onclick = E.renderList;
    await settleApplied(true);
    let items;
    try { items = await loadInbox(c); } catch (e) { toast(E.ghMessage(e), 9000); return E.renderList(); }
    cache.n = items.length; cache.at = Date.now();
    const appliedIds = new Set(applied.get().map((x) => x.subId));
    const waiting = applied.get();
    const open = items.filter((i) => !appliedIds.has(i.id));
    cache.n = open.length;

    const rows = open.map((it) => {
      let s = null;
      try { s = it.error ? null : cleanSub(it.data, it.id); } catch (e) { it.error = e.message; }
      return `<li class="row"><div class="row-main">
        ${s ? `<strong>${esc(s.title || s.article && s.article.title)}</strong>
        <div class="meta"><span class="tag">${esc(TYPE_LABEL[s.type])}</span><span>av ${esc(s.submittedBy || 'ukjent')}</span><span>${esc(fmtDT(s.submittedAt))}</span></div>`
        : `<strong>Ugyldig forslag</strong><div class="meta"><span>${esc(it.id)}</span><span>${esc(it.error || '')}</span></div>`}</div>
        <div class="row-actions">${s ? `<button class="btn small primary" data-a="review" data-id="${esc(it.id)}">Se gjennom</button>` : ''}
        <button class="btn small danger" data-a="reject" data-id="${esc(it.id)}">${s ? 'Avvis' : 'Fjern'}</button></div></li>`;
    }).join('');

    root.innerHTML = `
      <div class="ed-bar"><button class="btn" id="back">← Tilbake</button><span class="grow"></span><button class="btn" id="reload">↻ Oppdater</button></div>
      <h1>Innboks</h1>
      <p class="hint" style="margin-bottom:12px">Forslag fra redaktører. Ingenting publiseres før du har godkjent det og trykket «Publiser».</p>
      ${waiting.length ? `<div class="ed-status"><p><strong>${waiting.length} godkjent${waiting.length === 1 ? '' : 'e'}</strong> og lagt i utkastet. Gå tilbake til oversikten og trykk «Publiser» for å legge ${waiting.length === 1 ? 'det' : 'dem'} ut.</p></div>` : ''}
      ${open.length ? `<ul class="rows" id="inboxList">${rows}</ul>` : '<p class="empty">Ingen forslag venter på godkjenning.</p>'}`;
    $('#back').onclick = E.renderList;
    $('#reload').onclick = renderInbox;
    const list = $('#inboxList');
    if (list) list.addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-a]');
      if (!b) return;
      const it = open.find((x) => x.id === b.dataset.id);
      if (!it) return;
      if (b.dataset.a === 'review') return renderReview(it);
      b.disabled = true;
      await rejectItem(it);
    });
  }

  async function rejectItem(it) {
    const c = inbox.cfg();
    let s = null;
    try { s = cleanSub(it.data, it.id); } catch (e) { /* ugyldig: fjernes uten notat */ }
    let note = '';
    if (s) {
      note = prompt('Begrunnelse som vises til forfatteren (valgfritt):', '');
      if (note === null) return renderInbox();
    } else if (!confirm('Fjerne dette ugyldige forslaget fra innboksen?')) return renderInbox();
    try {
      await settle(c, it.id, s || { type: 'ugyldig', articleId: '', title: 'Ugyldig forslag' }, 'avvist', note);
      toast('Forslaget er avvist.');
    } catch (e) { toast(E.ghMessage(e), 9000); }
    cache.at = 0;
    renderInbox();
  }

  /* ---------- admin: gjennomgang ---------- */
  function lineDiff(a, b) {
    const A = a.split('\n'), B = b.split('\n');
    const n = A.length, m = B.length;
    if (n * m > 4e6) return null;
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
    const out = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { out.push([' ', A[i]]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) out.push(['-', A[i++]]);
      else out.push(['+', B[j++]]);
    }
    while (i < n) out.push(['-', A[i++]]);
    while (j < m) out.push(['+', B[j++]]);
    return out;
  }

  async function renderReview(it) {
    const c = inbox.cfg();
    let s;
    try { s = cleanSub(it.data, it.id); } catch (e) { toast('Ugyldig forslag: ' + e.message); return renderInbox(); }
    root.innerHTML = '<div class="ed-bar"><button class="btn" id="back">← Til innboksen</button></div><p class="empty">Henter forslaget …</p>';
    $('#back').onclick = renderInbox;

    // Hent og kontroller bildene
    const imgs = new Map();
    const problems = [];
    for (const n of s.images) {
      try {
        const blob = await ghFetch(c, P(c, 'venter/' + it.id + '/bilder/' + n), { raw: true, accept: 'application/vnd.github.raw+json' });
        const kind = await sniff(blob);
        if (!kind || !n.toLowerCase().endsWith('.' + kind)) throw new Error('filen er ikke et ekte ' + n.split('.').pop().toUpperCase() + '-bilde');
        const typed = blob.slice(0, blob.size, kind === 'jpg' ? 'image/jpeg' : 'image/' + kind);
        imgs.set(n, { blob: typed, url: URL.createObjectURL(typed) });
      } catch (e) { problems.push('Bildet «' + n + '» kunne ikke brukes (' + (e.message || 'feil') + ').'); }
    }

    const draft = E.draft;
    const cur = draft.articles.find((a) => a.id === s.articleId);
    const warn = [...problems];
    if (s.type === 'ny' && cur) warn.push('Det finnes allerede en artikkel med samme id. Ved godkjenning får den nye artikkelen en ny id.');
    if (s.type !== 'ny' && !cur) warn.push('Artikkelen finnes ikke lenger i håndboken. Forslaget kan ikke godkjennes.');
    if (s.type !== 'ny' && cur && s.baseSig && E.contentSig(cur) !== s.baseSig) warn.push('Artikkelen er endret etter at forslaget ble laget. Godkjenner du, overskrives disse endringene.');
    if (s.article && !draft.categories.includes(s.article.category)) warn.push('Kategorien «' + s.article.category + '» finnes ikke. Den opprettes hvis du godkjenner.');
    if (s.article) {
      const published = new Set();
      draft.articles.forEach((a) => E.imageNames(a.body).forEach((n) => published.add(E.imgName(n))));
      E.imageNames(s.article.body).map(E.imgName).forEach((n) => {
        if (!imgs.has(n) && !published.has(n) && !E.pending.has(n)) warn.push('Artikkelen bruker bildet «' + n + '» som ikke fulgte med.');
      });
    }
    const canApprove = !(s.type !== 'ny' && !cur);

    const imageSrc = (p) => { const r = imgs.get(E.imgName(p)); return r ? r.url : E.imageSrc(p); };
    const view = (a) => `<h1>${esc(a.title)}</h1>` + (E.markdown(a.body, { imageSrc }) || '<p class="hint">Ingen innhold.</p>');

    const fieldRows = () => {
      const old = cur || {}, nw = s.article;
      const titleOf = (id) => { const x = draft.articles.find((a) => a.id === id); return x ? x.title : id; };
      const f = [['Tittel', old.title, nw.title], ['Kategori', old.category, nw.category], ['Sammendrag', old.summary, nw.summary],
        ['Søkeord', (old.tags || []).join(', '), nw.tags.join(', ')], ['Se også', (old.related || []).map(titleOf).join(', '), nw.related.map(titleOf).join(', ')]]
        .filter(([, a, b]) => (a || '') !== (b || ''));
      return f.length ? '<table><thead><tr><th>Felt</th><th>Før</th><th>Etter</th></tr></thead><tbody>'
        + f.map(([k, a, b]) => `<tr><td>${esc(k)}</td><td>${esc(a || '–')}</td><td>${esc(b || '–')}</td></tr>`).join('') + '</tbody></table>' : '';
    };
    const diffView = () => {
      const d = lineDiff((cur && cur.body) || '', s.article.body);
      const meta = fieldRows();
      const body = d === null ? '<p class="hint">Teksten er for lang til å vise endringer linje for linje. Se «Forslag» og «Nåværende».</p>'
        : d.every(([k]) => k === ' ') ? '<p class="hint">Selve teksten er uendret.</p>'
          : '<div class="diff">' + d.map(([k, t]) => `<div class="d${k === '+' ? ' add' : k === '-' ? ' del' : ''}"><span>${k === ' ' ? '' : k}</span>${esc(t) || '&nbsp;'}</div>`).join('') + '</div>';
      return '<h2>Endringer</h2>' + meta + body;
    };

    root.innerHTML = `
      <div class="ed-bar">
        <button class="btn" id="back">← Til innboksen</button><span class="grow"></span>
        <button class="btn danger" id="rv-rej">✗ Avvis</button>
        <button class="btn primary" id="rv-ok" ${canApprove ? '' : 'disabled'}>✓ Godkjenn</button>
      </div>
      <h1>${esc(TYPE_LABEL[s.type])}: ${esc(s.title || (s.article && s.article.title) || '')}</h1>
      <p class="meta" style="margin-bottom:10px"><span>Fra ${esc(s.submittedBy || 'ukjent')}</span><span>${esc(fmtDT(s.submittedAt))}</span></p>
      ${warn.length ? `<div class="warnbox"><strong>Se opp:</strong><ul>${warn.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
      <div class="ed-tabs" role="tablist">
        ${s.type !== 'sletting' ? '<button data-tab="new" aria-pressed="true">Forslag</button>' : ''}
        ${s.type === 'endring' ? '<button data-tab="diff" aria-pressed="false">Endringer</button>' : ''}
        ${s.type !== 'ny' && cur ? `<button data-tab="cur" aria-pressed="${s.type === 'sletting'}">Nåværende</button>` : ''}
      </div>
      <div class="article" id="rv-body"></div>
      <p class="hint">Når du godkjenner, legges artikkelen i utkastet ditt. Den publiseres først når du trykker «Publiser».</p>`;

    const show = (tab) => {
      root.querySelectorAll('.ed-tabs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
      $('#rv-body').innerHTML = tab === 'diff' ? diffView() : tab === 'cur' ? view(cur) : view(s.article);
    };
    show(s.type === 'sletting' ? 'cur' : 'new');
    root.querySelectorAll('.ed-tabs button').forEach((b) => { b.onclick = () => show(b.dataset.tab); });
    $('#back').onclick = renderInbox;
    $('#rv-rej').onclick = () => rejectItem(it);
    $('#rv-ok').onclick = () => approve(it, s, imgs, cur);
  }

  async function approve(it, s, imgs, cur) {
    const draft = E.draft;
    if (s.type !== 'ny' && !cur) { toast('Artikkelen finnes ikke lenger.'); return; }
    if (s.type !== 'ny' && s.baseSig && E.contentSig(cur) !== s.baseSig
      && !confirm('Artikkelen er endret etter at forslaget ble laget. Godkjenner du, overskrives disse endringene. Fortsette?')) return;
    if (s.type === 'sletting' && !confirm('Slette «' + cur.title + '» fra håndboken?')) return;

    if (s.type === 'ny') {
      const art = { ...clone(s.article), updated: E.today() };
      art.id = E.uniqueId(art.id);
      draft.articles.push(art);
    } else if (s.type === 'endring') {
      const i = draft.articles.findIndex((a) => a.id === s.articleId);
      draft.articles[i] = { ...draft.articles[i], ...clone(s.article), updated: E.today() };
    } else {
      draft.articles.splice(draft.articles.findIndex((a) => a.id === s.articleId), 1);
      draft.articles.forEach((a) => { a.related = (a.related || []).filter((r) => r !== s.articleId); });
    }
    if (s.article && !draft.categories.includes(s.article.category)) draft.categories.push(s.article.category);
    for (const [name, r] of imgs) await E.addPendingBlob(name, r.blob);

    const list = applied.get().filter((x) => x.subId !== s.id);
    list.push({ subId: s.id, articleId: s.articleId, type: s.type, title: s.title || (s.article && s.article.title) || '' });
    applied.set(list);
    E.persist();
    cache.at = 0;
    toast('Godkjent og lagt i utkastet. Trykk «Publiser» i oversikten for å legge det ut.', 8000);
    renderInbox();
  }

  // Etter publisering flyttes godkjente forslag til «behandlet» og varsel-issuen lukkes.
  async function settleApplied(onlyPublished) {
    const c = inbox.cfg();
    if (!c) return;
    const all = applied.get();
    const todo = all.filter((x) => x.published);
    if (!todo.length) return;
    const keep = all.filter((x) => !x.published);
    const failed = [];
    for (const x of todo) {
      try {
        let r;
        try { r = await getJson(c, 'venter/' + x.subId + '/forslag.json'); } catch (e) { if (e.status === 404) continue; throw e; }
        let rec;
        try { rec = cleanSub(r.data, x.subId); } catch (e) { rec = { type: x.type, articleId: x.articleId, title: x.title }; }
        await settle(c, x.subId, rec, 'godkjent', '');
      } catch (e) { failed.push(x); }
    }
    applied.set(keep.concat(failed));
    if (failed.length && !onlyPublished) toast('Publisert, men statusen i innboksen ble ikke oppdatert for ' + failed.length + ' forslag. Det prøves igjen når du åpner innboksen.', 9000);
    cache.at = 0;
  }

  hooks.afterPublish = async () => {
    const list = applied.get();
    if (!list.length) return;
    list.forEach((x) => { x.published = true; });
    applied.set(list);
    try { await settleApplied(false); } catch (e) { /* prøves igjen senere */ }
  };
  hooks.onDiscard = () => applied.set([]);

  /* ---------- tilkobling ---------- */
  function connBadge(on) { return on ? ' <span class="badge-new">Tilkoblet</span>' : ''; }

  function renderConnections() {
    const g = gh.cfg(), i = inbox.cfg();
    root.innerHTML = `
      <div class="ed-bar"><button class="btn" id="back">← Tilbake</button></div>
      <h1>Tilkobling og roller</h1>
      <p>Alle kan skrive og endre artikler. Nøkkelen du kobler til, bestemmer hva du kan gjøre, og GitHub passer på at ingen kan publisere uten hovedadmin-nøkkelen.</p>
      <ul class="rows">
        <li class="row"><div class="row-main"><strong>Hovedadmin</strong>${connBadge(g)}
          <div class="meta"><span>Kan publisere direkte og godkjenne forslag. Bruker en nøkkel med skrivetilgang til håndbok-repoet. Bare hovedadmin skal ha denne.</span></div></div>
          <div class="row-actions"><button class="btn small" id="c-gh">${g ? 'Endre' : 'Koble til'}</button></div></li>
        <li class="row"><div class="row-main"><strong>Innboks for forslag</strong>${connBadge(i)}
          <div class="meta"><span>Redaktører sender forslag hit, og hovedadmin henter dem her. Nøkkelen gir bare tilgang til innboks-repoet, ikke til selve håndboken.</span></div></div>
          <div class="row-actions"><button class="btn small" id="c-in">${i ? 'Endre' : 'Koble til'}</button></div></li>
      </ul>
      ${g && i ? `
      <h2 class="section-title">Inviter redaktører</h2>
      <form id="inv" class="ed-form" autocomplete="off" style="max-width:560px">
        <div class="warnbox"><strong>Viktig:</strong> bruk en <em>egen</em> nøkkel til redaktørene som bare har tilgang til innboks-repoet. Aldri din egen hovedadmin-nøkkel. Alle som får lenken, får denne nøkkelen.</div>
        <label>Redaktørnøkkel <input type="password" id="inv-token" placeholder="github_pat_…" autocomplete="off"></label>
        <div class="ed-bar"><button class="btn primary" type="submit" id="inv-go">Lag invitasjonslenke</button></div>
        <div id="inv-out"></div>
      </form>` : ''}`;
    $('#back').onclick = E.renderList;
    $('#c-gh').onclick = E.renderGh;
    $('#c-in').onclick = renderInboxCfg;
    if ($('#inv')) $('#inv').addEventListener('submit', makeInvite);
  }
  hooks.renderConnections = renderConnections;

  async function makeInvite(e) {
    e.preventDefault();
    const g = gh.cfg(), i = inbox.cfg();
    const token = $('#inv-token').value.trim();
    if (!token) { toast('Lim inn redaktørnøkkelen.'); return; }
    if (token === g.token) { toast('Dette er hovedadmin-nøkkelen din! Lag en egen nøkkel for redaktørene.', 10000); return; }
    const btn = $('#inv-go');
    btn.disabled = true; btn.textContent = 'Kontrollerer …';
    try {
      // Nøkkelen må fungere mot innboksen ...
      await ghFetch({ owner: i.owner, repo: i.repo, token }, ghRepoUrl(i));
      // ... og må ikke gi skrivetilgang til håndbok-repoet
      let main = null;
      try { main = await ghFetch({ owner: g.owner, repo: g.repo, token }, ghRepoUrl(g)); } catch (err) { /* ingen tilgang er det vi ønsker */ }
      if (main && main.permissions && main.permissions.push) {
        toast('Denne nøkkelen har skrivetilgang til håndbok-repoet. Lag en ny nøkkel som bare har tilgang til innboks-repoet.', 12000);
        return;
      }
      const payload = encodeURIComponent(btoa(JSON.stringify({ o: i.owner, r: i.repo, t: token })));
      const url = location.origin + location.pathname.replace(/[^/]*$/, 'editor.html') + '#invitasjon=' + payload;
      $('#inv-out').innerHTML = `<label>Invitasjonslenke <input type="text" id="inv-url" readonly value="${esc(url)}"></label>
        <div class="ed-bar"><button class="btn" type="button" id="inv-copy">Kopier lenken</button></div>
        <p class="hint">Send lenken privat (ikke i en åpen kanal). Når en redaktør åpner den, kobles nettleseren automatisk til innboksen. Mistenker du at lenken har kommet på avveie, trekk nøkkelen tilbake på GitHub og lag en ny.</p>`;
      $('#inv-copy').onclick = async () => {
        try { await navigator.clipboard.writeText(url); toast('Lenken er kopiert.'); } catch (err) { $('#inv-url').select(); toast('Marker og kopier lenken manuelt.'); }
      };
    } catch (err) {
      toast(err instanceof GhError && err.status ? 'Nøkkelen fungerer ikke mot innboks-repoet. ' + E.ghMessage(err) : E.ghMessage(err), 10000);
    } finally { btn.disabled = false; btn.textContent = 'Lag invitasjonslenke'; }
  }

  function renderInboxCfg() {
    const cur = inbox.cfg();
    const g = gh.cfg();
    const det = E.detectRepo();
    const v = {
      owner: cur ? cur.owner : (g ? g.owner : det.owner),
      repo: cur ? cur.repo : 'handbok-innsendinger',
      name: localStorage.getItem(NAME_KEY) || ''
    };
    root.innerHTML = `
      <div class="ed-bar"><button class="btn" id="back" type="button">← Tilbake</button></div>
      <h1>Koble til innboksen</h1>
      <p>Her sendes og hentes forslag til godkjenning. Har du fått en invitasjonslenke, trenger du ikke fylle ut noe her.</p>
      <details class="ed-help" ${cur ? '' : 'open'}>
        <summary>Oppsett for hovedadmin (engangsjobb)</summary>
        <ol>
          <li>Lag et nytt <strong>privat</strong> repo på GitHub, for eksempel <code>handbok-innsendinger</code>. Da er forslag som ikke er godkjent ikke synlige for andre. Huk av for «Add a README file» så repoet ikke er tomt.</li>
          <li>Lag en <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">ny nøkkel</a> <strong>for redaktørene</strong>. Velg <em>Only select repositories</em> og bare innboks-repoet. Sett <strong>Contents</strong> til <em>Read and write</em>. Sett gjerne <strong>Issues</strong> til <em>Read and write</em> også, så får du e-postvarsel om nye forslag (slå på «Issues» i repoets innstillinger, og følg repoet).</li>
          <li>Til deg selv kan du bruke en nøkkel som har tilgang til <em>begge</em> repoene (håndboken og innboksen). Redaktørene skal <strong>aldri</strong> få nøkkelen som har tilgang til håndbok-repoet.</li>
          <li>Når du har koblet til både hovedadmin og innboks, finner du «Inviter redaktører» under «Tilkobling». Da får du en lenke som kobler redaktørene til med ett klikk.</li>
        </ol>
      </details>
      <form id="inf" class="ed-form" autocomplete="off" style="max-width:560px">
        <label>GitHub-bruker eller organisasjon <input type="text" id="i-owner" value="${esc(v.owner)}"></label>
        <label>Innboks-repo <input type="text" id="i-repo" value="${esc(v.repo)}"></label>
        <label>Tilgangsnøkkel <small>${cur ? '(la stå tom for å beholde nåværende)' : ''}</small>
          <input type="password" id="i-token" placeholder="github_pat_…" autocomplete="off"></label>
        <label>Ditt navn <small>(vises til den som godkjenner)</small><input type="text" id="i-name" value="${esc(v.name)}"></label>
        <label style="font-weight:400;display:flex;gap:8px;align-items:center"><input type="checkbox" id="i-remember" ${!cur || inbox.remembered() ? 'checked' : ''}> Husk nøkkelen på denne enheten</label>
        <div class="ed-bar">
          <button class="btn primary" type="submit" id="i-save">Test og lagre</button>
          ${cur ? '<button class="btn danger" type="button" id="i-clear">Fjern tilkobling</button>' : ''}
        </div>
      </form>`;
    $('#back').onclick = renderConnections;
    if ($('#i-clear')) $('#i-clear').onclick = () => {
      if (!confirm('Fjerne tilkoblingen til innboksen og slette nøkkelen fra denne nettleseren?')) return;
      inbox.clear();
      renderConnections();
      toast('Tilkoblingen er fjernet.');
    };
    $('#inf').addEventListener('submit', async (e) => {
      e.preventDefault();
      const c = { owner: $('#i-owner').value.trim(), repo: $('#i-repo').value.trim(), token: $('#i-token').value.trim() || (cur ? cur.token : '') };
      const name = $('#i-name').value.trim().slice(0, 80);
      if (!OWNER_RE.test(c.owner) || !OWNER_RE.test(c.repo)) { toast('Fyll inn bruker og repo.'); return; }
      if (!c.token) { toast('Lim inn tilgangsnøkkelen.'); return; }
      const btn = $('#i-save');
      btn.disabled = true; btn.textContent = 'Tester …';
      try {
        await ghFetch(c, ghRepoUrl(c));
        await listDir(c, 'venter');
        inbox.save(c, $('#i-remember').checked);
        if (name) { try { localStorage.setItem(NAME_KEY, name); } catch (err) { /* ignorer */ } }
        cache.at = 0; lastSubsFetch = 0;
        E.renderList();
        toast('Koblet til innboksen.' + (E.gh.cfg() ? '' : ' Du er nå redaktør: endringene dine sendes til godkjenning.'), 9000);
      } catch (err) {
        toast(E.ghMessage(err), 10000);
        btn.disabled = false; btn.textContent = 'Test og lagre';
      }
    });
  }

  // Invitasjonslenke: #invitasjon=<kode> kobler nettleseren til innboksen med ett klikk
  hooks.init = async () => {
    const m = location.hash.match(/^#invitasjon=(.+)$/);
    if (!m) return;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignorer */ }
    try {
      const inv = JSON.parse(atob(decodeURIComponent(m[1])));
      if (!OWNER_RE.test(inv.o) || !OWNER_RE.test(inv.r) || !/^[A-Za-z0-9_]{20,300}$/.test(inv.t)) throw new Error('ugyldig');
      if (!confirm('Koble til innboksen «' + inv.o + '/' + inv.r + '» som redaktør?\n\nDu kan da skrive artikler og sende dem til godkjenning. Ingenting publiseres uten at hovedadmin godkjenner det.')) return;
      inbox.save({ owner: inv.o, repo: inv.r, token: inv.t }, true);
      toast('Du er nå koblet til som redaktør.', 8000);
    } catch (e) {
      toast('Invitasjonslenken er ugyldig. Be om en ny.', 8000);
    }
  };

  E.start();
})();
