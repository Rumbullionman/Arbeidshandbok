(() => {
  'use strict';

  const { esc, markdown } = window.HBMD;
  const KEY = 'hbe:draft';
  const root = document.getElementById('ed');

  let base = { articles: [], categories: [] }; // publisert versjon
  let draft = null;                            // utkast som redigeres
  let filter = '';
  let baseSha = null;                          // sha for publisert fil på GitHub (hvis tilkoblet)
  let baseSrc = 'site';                        // 'gh' hvis publisert versjon er hentet fra GitHub
  let origin = null;                           // publisert versjon som utkastet bygger på
  let busy = false;

  /* ---------- hjelpere ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const today = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  function slug(t) {
    return t.toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'artikkel';
  }
  function uniqueId(seed) {
    const ids = new Set(draft.articles.map((a) => a.id));
    let id = seed, n = 2;
    while (ids.has(id)) id = seed + '-' + n++;
    return id;
  }

  let toastTimer;
  function toast(msg, ms = 4500) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  }

  const store = {
    get() { try { const r = localStorage.getItem(KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { toast('Kunne ikke lagre utkastet i nettleseren.'); } },
    getOrigin() { try { const r = localStorage.getItem(KEY + ':origin'); return r ? JSON.parse(r) : null; } catch (e) { return null; } },
    clear() { try { localStorage.removeItem(KEY); localStorage.removeItem(KEY + ':origin'); } catch (e) { /* ignorer */ } }
  };
  const persist = () => {
    store.set(draft);
    try { if (origin) localStorage.setItem(KEY + ':origin', JSON.stringify(origin)); } catch (e) { /* ignorer */ }
  };

  /* Sammenslåing: utkastet bygger på `origin`. Hvis noen andre har publisert siden (`theirs`),
     legges bare mine egne endringer oppå deres versjon, så ingenting forsvinner. */
  const mapOf = (d) => new Map(d.articles.map((a) => [a.id, a]));
  function sameContent(a, b) {
    const ma = mapOf(a), mb = mapOf(b);
    if (ma.size !== mb.size) return false;
    for (const [id, x] of ma) {
      const y = mb.get(id);
      if (!y || contentSig(x) !== contentSig(y)) return false;
    }
    return JSON.stringify(a.categories || []) === JSON.stringify(b.categories || []);
  }
  function merge(orig, mine, theirs) {
    const o = mapOf(orig), m = mapOf(mine);
    const out = clone(theirs);
    mine.articles.forEach((a) => {
      const prev = o.get(a.id);
      if (prev && contentSig(prev) === contentSig(a)) return; // uendret av meg
      const i = out.articles.findIndex((x) => x.id === a.id);
      if (i >= 0) out.articles[i] = clone(a); else out.articles.push(clone(a));
    });
    const removedByMe = orig.articles.filter((a) => !m.has(a.id)).map((a) => a.id);
    out.articles = out.articles.filter((a) => !removedByMe.includes(a.id));
    if (JSON.stringify(orig.categories || []) !== JSON.stringify(mine.categories || [])) {
      const cats = [...(mine.categories || [])];
      (theirs.categories || []).forEach((c) => { if (!cats.includes(c)) cats.push(c); });
      out.categories = cats;
    }
    return out;
  }
  // Holder utkastet i takt med publisert versjon. Returnerer en melding hvis noe ble endret.
  function syncDraft() {
    const saved = store.get();
    const current = draft || (saved && Array.isArray(saved.articles) ? saved : null);
    if (!current) { draft = clone(base); origin = clone(base); return null; }
    draft = current;
    draft.categories = draft.categories || [];
    origin = origin || store.getOrigin() || clone(base);
    if (sameContent(origin, base)) return null;
    if (sameContent(origin, draft)) {
      draft = clone(base); origin = clone(base); store.clear();
      return 'Håndboken er oppdatert siden sist. Du ser nå siste versjon.';
    }
    draft = merge(origin, draft, base);
    origin = clone(base);
    persist();
    return 'Håndboken er oppdatert av andre siden sist. Endringene dine er lagt oppå siste versjon.';
  }

  const contentSig = (a) => JSON.stringify([a.title, a.category, a.summary, a.tags || [], a.related || [], a.body]);

  function changes() {
    const bm = new Map(base.articles.map((a) => [a.id, contentSig(a)]));
    let added = 0, edited = 0;
    draft.articles.forEach((a) => {
      if (!bm.has(a.id)) added++;
      else if (bm.get(a.id) !== contentSig(a)) edited++;
    });
    const removed = base.articles.filter((a) => !draft.articles.some((x) => x.id === a.id)).length;
    const cats = JSON.stringify(base.categories || []) !== JSON.stringify(draft.categories || []);
    return { added, edited, removed, cats, total: added + edited + removed + (cats ? 1 : 0) };
  }
  function statusOf(a) {
    const b = base.articles.find((x) => x.id === a.id);
    if (!b) return 'Ny';
    return contentSig(b) !== contentSig(a) ? 'Endret' : '';
  }

  /* ---------- eksport ---------- */
  function finalize() {
    const d = clone(draft);
    d.categories = d.categories || [];
    d.articles.forEach((a) => { if (a.category && !d.categories.includes(a.category)) d.categories.push(a.category); });
    const ids = new Set(d.articles.map((a) => a.id));
    d.articles.forEach((a) => { a.related = (a.related || []).filter((r) => ids.has(r) && r !== a.id); });
    const t = today();
    d.updated = t;
    if (changes().total > 0) {
      const v = base.version || '';
      const n = v.startsWith(t + '.') ? (parseInt(v.split('.')[1], 10) || 0) + 1 : 1;
      d.version = t + '.' + n;
    } else {
      d.version = base.version || t + '.1';
    }
    return d;
  }

  function warnings(d) {
    const ids = new Set(d.articles.map((a) => a.id));
    const w = [];
    d.articles.forEach((a) => {
      if (!String(a.title || '').trim()) w.push('En artikkel mangler tittel.');
      (String(a.body || '').match(/#\/artikkel\/[a-z0-9-]+/g) || []).forEach((m) => {
        const id = m.slice(11);
        if (!ids.has(id)) w.push('«' + a.title + '» lenker til en artikkel som ikke finnes.');
      });
    });
    return w;
  }

  const json = (d) => JSON.stringify(d, null, 2) + '\n';

  /* ---------- GitHub ---------- */
  const GH_CFG = 'hbe:gh';
  const GH_TOK = 'hbe:ghtoken';

  class GhError extends Error {
    constructor(status, msg) { super(msg); this.status = status; }
  }

  const gh = {
    cfg() {
      try {
        const c = JSON.parse(localStorage.getItem(GH_CFG) || 'null');
        if (!c) return null;
        c.token = localStorage.getItem(GH_TOK) || sessionStorage.getItem(GH_TOK) || '';
        return c.owner && c.repo && c.token ? c : null;
      } catch (e) { return null; }
    },
    save(c, remember) {
      try {
        localStorage.setItem(GH_CFG, JSON.stringify({ owner: c.owner, repo: c.repo, branch: c.branch, path: c.path }));
        localStorage.removeItem(GH_TOK);
        sessionStorage.removeItem(GH_TOK);
        (remember ? localStorage : sessionStorage).setItem(GH_TOK, c.token);
      } catch (e) { toast('Kunne ikke lagre tilkoblingen i nettleseren.'); }
    },
    clear() {
      try {
        localStorage.removeItem(GH_CFG);
        localStorage.removeItem(GH_TOK);
        sessionStorage.removeItem(GH_TOK);
      } catch (e) { /* ignorer */ }
    }
  };

  async function ghFetch(c, url, opts = {}) {
    let res;
    try {
      res = await fetch('https://api.github.com' + url, {
        ...opts,
        cache: 'no-store',
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': 'Bearer ' + c.token,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(opts.body ? { 'Content-Type': 'application/json' } : {})
        }
      });
    } catch (e) {
      throw new GhError(0, 'Ingen kontakt med GitHub. Sjekk nettforbindelsen.');
    }
    if (!res.ok) {
      let m = '';
      try { m = (await res.json()).message || ''; } catch (e) { /* ingen tekst */ }
      throw new GhError(res.status, m);
    }
    return res.json();
  }

  const ghRepoUrl = (c) => '/repos/' + encodeURIComponent(c.owner) + '/' + encodeURIComponent(c.repo);
  const ghFilePath = (c) => ghRepoUrl(c) + '/contents/' + c.path.split('/').map(encodeURIComponent).join('/');

  function b64enc(s) {
    let bin = '';
    new TextEncoder().encode(s).forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }
  function b64dec(s) {
    const bin = atob(s.replace(/\s/g, ''));
    return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
  }

  async function ghGetFile(c) {
    const r = await ghFetch(c, ghFilePath(c) + (c.branch ? '?ref=' + encodeURIComponent(c.branch) : ''));
    if (Array.isArray(r) || r.type !== 'file') throw new GhError(404, 'Stien peker ikke på en fil.');
    if (!r.content) throw new GhError(0, 'Filen er for stor til å hentes via GitHub (over 1 MB).');
    let data;
    try { data = JSON.parse(b64dec(r.content)); } catch (e) { throw new GhError(0, 'Filen på GitHub er ikke gyldig JSON.'); }
    return { sha: r.sha, data };
  }

  function ghPutFile(c, text, sha, message) {
    const body = { message, content: b64enc(text) };
    if (sha) body.sha = sha;
    if (c.branch) body.branch = c.branch;
    return ghFetch(c, ghFilePath(c), { method: 'PUT', body: JSON.stringify(body) });
  }

  function ghMessage(e) {
    if (!(e instanceof GhError)) return 'Noe gikk galt: ' + (e && e.message ? e.message : e);
    switch (e.status) {
      case 0: return e.message;
      case 401: return 'GitHub avviste tilgangsnøkkelen. Den kan være feil kopiert eller utløpt. Lag en ny under «GitHub».';
      case 403: return 'Ikke tilgang. Sjekk at nøkkelen har rettigheten «Contents: Read and write» for dette repoet, eller vent litt hvis du har gjort mange forespørsler.';
      case 404: return 'Fant ikke repoet eller filen. Sjekk navn og sti, og at nøkkelen har tilgang til repoet.';
      case 409:
      case 422: return 'Filen ble endret av noen andre mens du publiserte. Prøv igjen.';
      default: return 'GitHub svarte med feil (' + e.status + ')' + (e.message ? ': ' + e.message : '.');
    }
  }

  function detectRepo() {
    const h = location.hostname;
    if (!h.endsWith('.github.io')) return { owner: '', repo: '' };
    const first = location.pathname.split('/').filter(Boolean)[0];
    return { owner: h.split('.')[0], repo: first && !first.includes('.') ? first : h };
  }

  async function publishGH() {
    if (busy) return;
    const c = gh.cfg();
    if (!c) return renderGh();
    if (!changes().total) { toast('Ingen endringer å publisere.'); return; }
    const d = finalize();
    const w = warnings(d);
    if (w.length && !confirm('Advarsler:\n\n' + w.slice(0, 6).join('\n') + '\n\nPublisere likevel?')) return;

    busy = true;
    const btn = $('#pub');
    if (btn) { btn.disabled = true; btn.textContent = 'Publiserer …'; }
    try {
      let remote = null;
      try { remote = await ghGetFile(c); } catch (e) { if (e.status !== 404) throw e; }
      const conflict = remote && (baseSha ? remote.sha !== baseSha : (remote.data.version || '') !== (base.version || ''));
      if (conflict && !confirm('Noen har publisert nye endringer etter at du åpnet editoren. Hvis du publiserer nå, overskrives disse. Publisere likevel?')) return;

      const res = await ghPutFile(c, json(d), remote ? remote.sha : null, 'Oppdater håndbok (' + d.version + ')');
      baseSha = (res && res.content && res.content.sha) || null;
      draft = d;
      base = clone(d);
      origin = clone(d);
      persist();
      toast('Publisert! Det tar vanligvis 1–2 minutter før endringene er ute i håndboken.', 10000);
    } catch (e) {
      toast(ghMessage(e), 10000);
    } finally {
      busy = false;
      renderList();
    }
  }

  function renderGh() {
    const cur = gh.cfg();
    const det = detectRepo();
    const v = {
      owner: cur ? cur.owner : det.owner,
      repo: cur ? cur.repo : det.repo,
      path: cur ? cur.path : 'content/articles.json',
      branch: cur ? cur.branch || '' : ''
    };
    root.innerHTML = `
      <div class="ed-bar"><button class="btn" id="back" type="button">← Tilbake</button></div>
      <h1>Koble til GitHub</h1>
      <p>Når editoren er koblet til GitHub, publiserer du med ett klikk. Endringene lagres i repoet ditt, og GitHub Pages legger dem ut automatisk.</p>
      <details class="ed-help" ${cur ? '' : 'open'}>
        <summary>Slik lager du en tilgangsnøkkel (engangsjobb)</summary>
        <ol>
          <li>Logg inn på GitHub og åpne <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">siden for å lage en ny nøkkel</a>.</li>
          <li>Gi den et navn, for eksempel «Håndbok-editor», og velg hvor lenge den skal gjelde.</li>
          <li>Under <strong>Repository access</strong>: velg <em>Only select repositories</em> og velg håndbok-repoet.</li>
          <li>Under <strong>Permissions → Repository permissions</strong>: sett <strong>Contents</strong> til <em>Read and write</em>.</li>
          <li>Trykk <strong>Generate token</strong>, kopier nøkkelen og lim den inn under. GitHub viser den bare én gang.</li>
        </ol>
      </details>
      <form id="ghf" class="ed-form" autocomplete="off" style="max-width:560px">
        <label>GitHub-bruker eller organisasjon <input type="text" id="g-owner" value="${esc(v.owner)}" placeholder="f.eks. firma-as"></label>
        <label>Repo <input type="text" id="g-repo" value="${esc(v.repo)}" placeholder="f.eks. handbok"></label>
        <label>Tilgangsnøkkel <small>${cur ? '(la stå tom for å beholde nåværende)' : ''}</small>
          <input type="password" id="g-token" placeholder="github_pat_…" autocomplete="off"></label>
        <label style="font-weight:400;display:flex;gap:8px;align-items:center"><input type="checkbox" id="g-remember" ${!cur || localStorage.getItem(GH_TOK) ? 'checked' : ''}> Husk nøkkelen på denne enheten</label>
        <p class="hint" style="margin-top:-6px">Nøkkelen lagres bare i denne nettleseren. Fjern hake for å bare beholde den til du lukker fanen. Bruk ikke dette på felles eller offentlige maskiner.</p>
        <details class="ed-help"><summary>Avansert</summary>
          <label>Filsti i repoet <input type="text" id="g-path" value="${esc(v.path)}"></label>
          <label>Gren (branch) <small>(tom = standardgren)</small><input type="text" id="g-branch" value="${esc(v.branch)}"></label>
        </details>
        <div class="ed-bar">
          <button class="btn primary" type="submit" id="g-save">Test og lagre</button>
          ${cur ? '<button class="btn danger" type="button" id="g-clear">Fjern tilkobling</button>' : ''}
        </div>
      </form>`;

    $('#back').onclick = renderList;
    if ($('#g-clear')) $('#g-clear').onclick = async () => {
      if (!confirm('Fjerne tilkoblingen og slette nøkkelen fra denne nettleseren?')) return;
      gh.clear();
      await loadBase();
      const msg = syncDraft();
      renderList();
      toast('Tilkoblingen er fjernet.' + (msg ? ' ' + msg : ''));
    };
    $('#ghf').addEventListener('submit', async (e) => {
      e.preventDefault();
      const c = {
        owner: $('#g-owner').value.trim(),
        repo: $('#g-repo').value.trim(),
        path: $('#g-path').value.trim().replace(/^\/+/, '') || 'content/articles.json',
        branch: $('#g-branch').value.trim(),
        token: $('#g-token').value.trim() || (cur ? cur.token : '')
      };
      if (!c.owner || !c.repo) { toast('Fyll inn bruker/organisasjon og repo.'); return; }
      if (!c.token) { toast('Lim inn tilgangsnøkkelen.'); return; }
      const btn = $('#g-save');
      btn.disabled = true; btn.textContent = 'Tester …';
      try {
        await ghFetch(c, ghRepoUrl(c));
        let exists = true;
        try { await ghGetFile(c); } catch (err) { if (err.status === 404) exists = false; else throw err; }
        gh.save(c, $('#g-remember').checked);
        await loadBase();
        const msg = syncDraft();
        renderList();
        toast((exists
          ? 'Koblet til GitHub. Skrivetilgang bekreftes første gang du publiserer.'
          : 'Koblet til repoet, men filen «' + c.path + '» finnes ikke der ennå. Den opprettes første gang du publiserer.') + (msg ? ' ' + msg : ''), 10000);
      } catch (err) {
        toast(ghMessage(err), 10000);
        btn.disabled = false; btn.textContent = 'Test og lagre';
      }
    });
  }

  function download(d) {
    const blob = new Blob([json(d)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'articles.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }

  async function doExport(kind) {
    const d = finalize();
    const w = warnings(d);
    if (w.length && !confirm('Advarsler:\n\n' + w.slice(0, 6).join('\n') + '\n\nFortsette likevel?')) return;
    try {
      if (kind === 'file') {
        const h = await window.showSaveFilePicker({
          suggestedName: 'articles.json',
          types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
        });
        const wr = await h.createWritable();
        await wr.write(json(d));
        await wr.close();
        toast('Filen er lagret. Last den opp til webserveren hvis den ikke ligger der allerede.', 7000);
      } else {
        download(d);
        toast('articles.json er lastet ned. Erstatt filen content/articles.json på webserveren med den.', 8000);
      }
      draft = d;
      persist();
      renderList();
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      toast('Kunne ikke lagre: ' + (e && e.message ? e.message : e));
    }
  }

  /* ---------- liste ---------- */
  function renderList() {
    const c = changes();
    const canSave = typeof window.showSaveFilePicker === 'function';
    const ghOn = !!gh.cfg();
    const parts = [];
    if (c.added) parts.push(c.added + (c.added === 1 ? ' ny' : ' nye'));
    if (c.edited) parts.push(c.edited + (c.edited === 1 ? ' endret' : ' endrede'));
    if (c.removed) parts.push(c.removed + (c.removed === 1 ? ' slettet' : ' slettede'));
    if (c.cats) parts.push('endringer i kategorier');

    const f = filter.toLowerCase();
    const order = draft.categories || [];
    const items = draft.articles
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => !f || (a.title + ' ' + a.category + ' ' + (a.tags || []).join(' ')).toLowerCase().includes(f))
      .sort((x, y) => {
        const cx = order.indexOf(x.a.category), cy = order.indexOf(y.a.category);
        return (cx < 0 ? 99 : cx) - (cy < 0 ? 99 : cy) || x.i - y.i;
      })
      .map((x) => x.a);

    let lastCat = null;
    const rows = items.map((a) => {
      const st = statusOf(a);
      let head = '';
      if (!f && a.category !== lastCat) { head = `<li class="group-title">${esc(a.category)}</li>`; lastCat = a.category; }
      return head + `<li class="row">
        <div class="row-main"><strong>${esc(a.title)}</strong>
          <div class="meta"><span class="tag">${esc(a.category)}</span>${st ? `<span class="badge-new">${st}</span>` : ''}<span>Oppdatert ${esc(a.updated || '')}</span></div></div>
        <div class="row-actions">
          <button class="btn small" data-act="edit" data-id="${esc(a.id)}">Rediger</button>
          <button class="btn small" data-act="dup" data-id="${esc(a.id)}">Kopier</button>
          <button class="btn small danger" data-act="del" data-id="${esc(a.id)}">Slett</button>
        </div></li>`;
    }).join('');

    root.innerHTML = `
      <div class="ed-bar">
        <button class="btn primary" id="new">+ Ny artikkel</button>
        <button class="btn" id="cats">Kategorier</button>
        <span class="grow"></span>
        <button class="btn" id="ghset">${ghOn ? '⚙ GitHub (tilkoblet)' : '⚙ Koble til GitHub'}</button>
        <button class="btn" id="imp">Importer fil</button>
        <input type="file" id="file" accept="application/json,.json" hidden>
      </div>
      <div class="ed-status ${c.total ? 'dirty' : ''}" id="status">
        ${c.total
          ? `<p><strong>Ikke publisert ennå:</strong> ${parts.join(', ')}.</p>
             <p>${ghOn
               ? 'Trykk «Publiser» for å legge endringene ut i håndboken. Alle får dem neste gang de er på nett.'
               : 'Når du er fornøyd: lagre filen og legg den på webserveren (erstatt <code>content/articles.json</code>). Da får alle oppdateringen neste gang de er på nett. Eller koble til GitHub for å publisere med ett klikk.'}</p>
             <div class="ed-bar" style="margin:8px 0 0">
               ${ghOn && baseSrc === 'gh' ? '<button class="btn primary" id="pub">🚀 Publiser til GitHub</button>' : ''}
               ${ghOn && baseSrc !== 'gh' ? '<span class="hint">Fikk ikke hentet siste versjon fra GitHub. Last siden på nytt når du er på nett for å publisere.</span>' : ''}
               <button class="btn${ghOn ? '' : ' primary'}" id="dl">⬇ Last ned articles.json</button>
               ${canSave ? '<button class="btn" id="save">💾 Lagre direkte til fil …</button>' : ''}
               <button class="btn danger" id="discard">Forkast endringer</button>
             </div>`
          : `<p>Ingen endringer ennå. Alt her er likt det som er publisert.</p>
             <div class="ed-bar" style="margin:8px 0 0"><button class="btn" id="dl">⬇ Last ned articles.json</button></div>`}
      </div>
      <div class="search"><input id="flt" type="search" placeholder="Søk blant artiklene" value="${esc(filter)}" aria-label="Søk blant artiklene"></div>
      ${items.length ? `<ul class="rows">${rows}</ul>` : '<p class="empty">Ingen artikler. Trykk «Ny artikkel» for å lage den første.</p>'}`;

    $('#new').onclick = () => renderEdit(null);
    $('#cats').onclick = renderCats;
    $('#dl').onclick = () => doExport('download');
    $('#ghset').onclick = renderGh;
    if ($('#pub')) $('#pub').onclick = publishGH;
    if ($('#save')) $('#save').onclick = () => doExport('file');
    if ($('#discard')) $('#discard').onclick = () => {
      if (!confirm('Forkaste alle endringer og gå tilbake til publisert versjon?')) return;
      draft = clone(base);
      origin = clone(base);
      store.clear();
      renderList();
      toast('Endringene er forkastet.');
    };
    $('#imp').onclick = () => $('#file').click();
    $('#file').onchange = importFile;
    $('#flt').oninput = (e) => {
      filter = e.target.value;
      const pos = e.target.selectionStart;
      renderList();
      const el = $('#flt'); el.focus(); el.setSelectionRange(pos, pos);
    };
    root.querySelector('.rows') && root.querySelector('.rows').addEventListener('click', onRowClick);
  }

  function onRowClick(e) {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const id = b.dataset.id;
    const a = draft.articles.find((x) => x.id === id);
    if (!a) return;
    if (b.dataset.act === 'edit') return renderEdit(id);
    if (b.dataset.act === 'dup') {
      const copy = clone(a);
      copy.title = a.title + ' (kopi)';
      copy.id = uniqueId(slug(copy.title));
      copy.updated = today();
      draft.articles.push(copy);
      persist();
      return renderEdit(copy.id);
    }
    if (b.dataset.act === 'del') {
      if (!confirm('Slette «' + a.title + '»? Dette kan ikke angres, men du kan forkaste alle endringer før du publiserer.')) return;
      draft.articles = draft.articles.filter((x) => x.id !== id);
      draft.articles.forEach((x) => { x.related = (x.related || []).filter((r) => r !== id); });
      persist();
      renderList();
      toast('Artikkelen er slettet.');
    }
  }

  function importFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const j = JSON.parse(reader.result);
        if (!j || !Array.isArray(j.articles) || !j.articles.every((a) => a && a.id && a.title && a.category)) throw new Error('Ugyldig innhold');
        if (!confirm('Dette erstatter utkastet ditt med innholdet i filen. Fortsette?')) return;
        j.categories = Array.isArray(j.categories) ? j.categories : [...new Set(j.articles.map((a) => a.category))];
        draft = j;
        persist();
        renderList();
        toast('Filen er importert.');
      } catch (err) {
        toast('Kunne ikke lese filen. Er det en articles.json fra håndboken?');
      }
    };
    reader.readAsText(file);
  }

  /* ---------- artikkelredigering ---------- */
  function lineOp(ta, fn) {
    const v = ta.value;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const ls = v.lastIndexOf('\n', s - 1) + 1;
    let le = v.indexOf('\n', e);
    if (le < 0) le = v.length;
    const lines = v.slice(ls, le).split('\n');
    let n = 0;
    const out = lines.map((l) => (lines.length > 1 && !l.trim()) ? l : fn(l, n++)).join('\n');
    ta.setRangeText(out, ls, le, 'select');
    ta.focus();
    ta.dispatchEvent(new Event('input'));
  }
  function wrap(ta, l, r, placeholder) {
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = ta.value.slice(s, e) || placeholder;
    ta.setRangeText(l + sel + r, s, e, 'end');
    ta.focus();
    ta.dispatchEvent(new Event('input'));
  }
  function insertBlock(ta, text) {
    const s = ta.selectionStart, e = ta.selectionEnd;
    const before = ta.value.slice(0, s);
    const lead = before && !before.endsWith('\n') ? '\n' : '';
    ta.setRangeText(lead + text, s, e, 'end');
    ta.focus();
    ta.dispatchEvent(new Event('input'));
  }

  const TOOLS = {
    h: (ta) => lineOp(ta, (l) => '## ' + (l.replace(/^#+\s*/, '') || 'Overskrift')),
    b: (ta) => wrap(ta, '**', '**', 'fet tekst'),
    ul: (ta) => lineOp(ta, (l) => '- ' + (l.replace(/^\s*[-*]\s+/, '') || 'Punkt')),
    ol: (ta) => lineOp(ta, (l, i) => (i + 1) + '. ' + (l.replace(/^\s*\d+[.)]\s+/, '') || 'Steg')),
    note: (ta) => lineOp(ta, (l) => '> ' + (l.replace(/^>\s*!?\s*/, '') || 'Viktig å vite')),
    warn: (ta) => lineOp(ta, (l) => '> ! ' + (l.replace(/^>\s*!?\s*/, '') || 'Advarsel')),
    table: (ta) => insertBlock(ta, '\n| Kolonne 1 | Kolonne 2 |\n|---|---|\n| Verdi | Verdi |\n| Verdi | Verdi |\n'),
    ext: (ta) => {
      const url = prompt('Skriv inn nettadressen (må starte med https://):', 'https://');
      if (!url || !/^https?:\/\//.test(url)) { if (url) toast('Adressen må starte med http:// eller https://'); return; }
      wrap(ta, '[', '](' + url + ')', 'lenketekst');
    }
  };

  function renderEdit(id) {
    if (!draft.categories.length) {
      toast('Lag først en kategori.');
      return renderCats();
    }
    const isNew = !id;
    const a = isNew
      ? { id: '', title: '', category: draft.categories[0], summary: '', tags: [], related: [], body: '', updated: today() }
      : clone(draft.articles.find((x) => x.id === id));
    if (!a) return renderList();

    const others = draft.articles.filter((x) => x.id !== a.id);
    const catOpts = draft.categories.map((c) => `<option value="${esc(c)}"${c === a.category ? ' selected' : ''}>${esc(c)}</option>`).join('')
      + (a.category && !draft.categories.includes(a.category) ? `<option value="${esc(a.category)}" selected>${esc(a.category)}</option>` : '')
      + '<option value="__new">+ Ny kategori …</option>';

    root.innerHTML = `
      <div class="ed-bar">
        <button class="btn" id="back" type="button">← Tilbake</button>
        <span class="grow"></span>
        <button class="btn primary" id="saveArt" type="button">Lagre artikkel</button>
      </div>
      <h1>${isNew ? 'Ny artikkel' : 'Rediger artikkel'}</h1>
      <div class="ed-grid">
        <form id="f" class="ed-form" autocomplete="off">
          <label>Tittel <input type="text" id="f-title" value="${esc(a.title)}" placeholder="F.eks. Slik bestiller du kontorrekvisita"></label>
          <label>Kategori <select id="f-cat">${catOpts}</select></label>
          <label>Kort sammendrag <small>(vises i oversikten)</small><input type="text" id="f-sum" value="${esc(a.summary || '')}" placeholder="Én setning om hva artikkelen handler om"></label>
          <label>Søkeord <small>(skilt med komma, gjerne synonymer folk kan finne på å søke etter)</small><input type="text" id="f-tags" value="${esc((a.tags || []).join(', '))}" placeholder="bestilling, rekvisita, innkjøp"></label>
          <fieldset><legend>Se også <small>(vises nederst i artikkelen)</small></legend>
            ${others.length ? others.map((o) => `<label><input type="checkbox" name="rel" value="${esc(o.id)}"${(a.related || []).includes(o.id) ? ' checked' : ''}> ${esc(o.title)}</label>`).join('') : '<small>Ingen andre artikler ennå.</small>'}
          </fieldset>
          <div class="field">
            <span class="lbl">Innhold</span>
            <div class="tb" role="toolbar" aria-label="Formatering">
              <button type="button" data-tb="h" title="Gjør linjen til overskrift">Overskrift</button>
              <button type="button" data-tb="b" title="Fet tekst"><strong>B</strong></button>
              <button type="button" data-tb="ul" title="Punktliste">• Liste</button>
              <button type="button" data-tb="ol" title="Nummerert liste">1. Steg</button>
              <button type="button" data-tb="note" title="Merknad">💡 Merknad</button>
              <button type="button" data-tb="warn" title="Advarsel">⚠ Advarsel</button>
              <button type="button" data-tb="table" title="Sett inn tabell">Tabell</button>
              <button type="button" data-tb="ext" title="Lenke til nettside">🔗 Nettlenke</button>
              <select id="linkSel" aria-label="Lenke til annen artikkel">
                <option value="">Lenke til artikkel …</option>
                ${others.map((o) => `<option value="${esc(o.id)}">${esc(o.title)}</option>`).join('')}
              </select>
            </div>
            <textarea id="f-body" placeholder="Skriv her. Marker tekst og bruk knappene over for å formatere.">${esc(a.body || '')}</textarea>
            <p class="hint">Tom linje gir nytt avsnitt. Forhåndsvisningen viser hvordan det blir i håndboken.</p>
          </div>
        </form>
        <div class="preview-wrap">
          <h2 class="section-title" style="margin-top:0">Forhåndsvisning</h2>
          <div class="article" id="preview"></div>
        </div>
      </div>`;

    const ta = $('#f-body');
    const collect = () => ({
      title: $('#f-title').value.trim(),
      category: $('#f-cat').value,
      summary: $('#f-sum').value.trim(),
      tags: $('#f-tags').value.split(',').map((s) => s.trim()).filter(Boolean),
      related: [...root.querySelectorAll('input[name="rel"]:checked')].map((i) => i.value),
      body: ta.value.replace(/\r/g, '').replace(/\s+$/, '')
    });
    const preview = () => {
      const f = collect();
      $('#preview').innerHTML = `<h1>${esc(f.title || 'Uten tittel')}</h1>` + (markdown(f.body) || '<p class="hint">Innholdet vises her.</p>');
    };
    preview();
    let initial = JSON.stringify(collect());

    ta.addEventListener('input', preview);
    $('#f-title').addEventListener('input', preview);
    $('#f-cat').addEventListener('change', (e) => {
      if (e.target.value !== '__new') return;
      const name = (prompt('Navn på ny kategori:') || '').trim();
      if (!name) { e.target.value = draft.categories.includes(a.category) ? a.category : draft.categories[0]; return; }
      if (!draft.categories.includes(name)) { draft.categories.push(name); persist(); }
      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      e.target.insertBefore(opt, e.target.querySelector('option[value="__new"]'));
      e.target.value = name;
    });
    root.querySelector('.tb').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-tb]');
      if (b) TOOLS[b.dataset.tb](ta);
    });
    $('#linkSel').addEventListener('change', (e) => {
      const target = draft.articles.find((x) => x.id === e.target.value);
      if (target) {
        const s = ta.selectionStart, en = ta.selectionEnd;
        const text = ta.value.slice(s, en) || target.title;
        ta.setRangeText('[' + text + '](#/artikkel/' + target.id + ')', s, en, 'end');
        ta.focus();
        ta.dispatchEvent(new Event('input'));
      }
      e.target.value = '';
    });

    const leave = () => {
      if (JSON.stringify(collect()) !== initial && !confirm('Du har ulagrede endringer i artikkelen. Forlate siden uten å lagre?')) return;
      renderList();
    };
    $('#back').onclick = leave;

    const save = () => {
      const f = collect();
      if (!f.title) { toast('Skriv inn en tittel først.'); $('#f-title').focus(); return; }
      if (!f.category || f.category === '__new') { toast('Velg en kategori.'); return; }
      if (isNew) {
        draft.articles.push({ id: uniqueId(slug(f.title)), ...f, updated: today() });
      } else {
        const i = draft.articles.findIndex((x) => x.id === a.id);
        const prev = draft.articles[i];
        const next = { ...prev, ...f };
        next.updated = contentSig(prev) !== contentSig(next) ? today() : prev.updated;
        draft.articles[i] = next;
      }
      persist();
      initial = JSON.stringify(f);
      renderList();
      window.scrollTo(0, 0);
      toast('Artikkelen er lagret i utkastet. Husk å laste ned articles.json når du er ferdig.', 6000);
    };
    $('#saveArt').onclick = save;
    $('#f').addEventListener('submit', (e) => { e.preventDefault(); save(); });
    window.scrollTo(0, 0);
    (isNew ? $('#f-title') : ta).focus({ preventScroll: true });
  }

  /* ---------- kategorier ---------- */
  function renderCats() {
    const cats = draft.categories;
    const count = (c) => draft.articles.filter((a) => a.category === c).length;
    root.innerHTML = `
      <div class="ed-bar"><button class="btn" id="back">← Tilbake</button></div>
      <h1>Kategorier</h1>
      <p class="hint" style="margin-bottom:12px">Rekkefølgen her er rekkefølgen på forsiden i håndboken.</p>
      ${cats.length ? `<ul class="rows" id="catlist">${cats.map((c, i) => `
        <li class="row">
          <div class="row-main"><strong>${esc(c)}</strong><div class="meta">${count(c)} artikler</div></div>
          <div class="row-actions">
            <button class="btn small" data-a="up" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Flytt opp">↑</button>
            <button class="btn small" data-a="down" data-i="${i}" ${i === cats.length - 1 ? 'disabled' : ''} aria-label="Flytt ned">↓</button>
            <button class="btn small" data-a="ren" data-i="${i}">Gi nytt navn</button>
            <button class="btn small danger" data-a="del" data-i="${i}" ${count(c) ? 'disabled title="Flytt eller slett artiklene først"' : ''}>Slett</button>
          </div>
        </li>`).join('')}</ul>` : '<p class="empty">Ingen kategorier ennå.</p>'}
      <form id="addcat" class="ed-inline ed-form">
        <input type="text" id="newcat" placeholder="Ny kategori, f.eks. «Kundeservice»" aria-label="Navn på ny kategori">
        <button class="btn primary" type="submit">Legg til</button>
      </form>`;

    $('#back').onclick = renderList;
    $('#addcat').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('#newcat').value.trim();
      if (!name) return;
      if (cats.includes(name)) { toast('Kategorien finnes allerede.'); return; }
      cats.push(name);
      persist();
      renderCats();
    });
    const list = $('#catlist');
    if (list) list.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-a]');
      if (!b || b.disabled) return;
      const i = Number(b.dataset.i);
      const a = b.dataset.a;
      if (a === 'up' || a === 'down') {
        const j = a === 'up' ? i - 1 : i + 1;
        [cats[i], cats[j]] = [cats[j], cats[i]];
      } else if (a === 'ren') {
        const name = (prompt('Nytt navn:', cats[i]) || '').trim();
        if (!name || name === cats[i]) return;
        if (cats.includes(name)) { toast('Det finnes allerede en kategori med det navnet.'); return; }
        draft.articles.forEach((x) => { if (x.category === cats[i]) x.category = name; });
        cats[i] = name;
      } else if (a === 'del') {
        if (!confirm('Slette kategorien «' + cats[i] + '»?')) return;
        cats.splice(i, 1);
      }
      persist();
      renderCats();
    });
  }

  /* ---------- oppstart ---------- */
  // Henter publisert versjon: fra GitHub hvis tilkoblet (alltid ferskest), ellers fra nettsiden.
  async function loadBase() {
    const fix = () => { base.categories = base.categories || [...new Set(base.articles.map((a) => a.category))]; };
    const c = gh.cfg();
    if (c) {
      try {
        const r = await ghGetFile(c);
        if (r.data && Array.isArray(r.data.articles)) {
          base = r.data;
          baseSha = r.sha;
          baseSrc = 'gh';
          fix();
          return;
        }
      } catch (e) {
        if (e.status) toast(ghMessage(e), 8000);
      }
    }
    baseSha = null;
    baseSrc = 'site';
    try {
      const res = await fetch('content/articles.json', { cache: 'no-cache' });
      if (res.ok) {
        const j = await res.json();
        if (j && Array.isArray(j.articles)) base = j;
      }
    } catch (e) { /* offline uten lagret kopi */ }
    fix();
  }

  async function start() {
    await loadBase();

    const msg = syncDraft();
    renderList();
    if (msg) toast(msg, 9000);
    else if (changes().total) toast('Du har endringer som ikke er publisert ennå.', 5000);
  }

  start();
})();
