/* Utseende-siden i editoren: farger for lyst og mørkt, skrift, logo og flere lagrede temaer.
   Bare hovedadmin (og den som redigerer uten GitHub-tilkobling) ser denne siden. */
(() => {
  'use strict';
  const E = window.HBE, T = window.HBTheme;
  const { esc, $, clone, toast, root } = E;

  const COLORS = [
    ['accent', 'Hovedfarge', 'Toppfelt, knapper og lenker'],
    ['bg', 'Bakgrunn', 'Bak alt innhold'],
    ['surface', 'Kort og flater', 'Kort og artikler'],
    ['text', 'Tekst', 'Brødtekst og overskrifter']
  ];
  const LOGO_MAX_H = 160, LOGO_MAX_W = 480;
  let W = null, sel = null, startJson = '';

  const theme = () => W.temaer.find((x) => x.id === sel);
  const logoSrc = () => {
    if (!W.logo) return '';
    const p = E.pending.get(E.imgName(W.logo));
    return p ? p.url : 'content/' + W.logo;
  };

  /* ---------- forhåndsvisning ---------- */
  function mock(th, mode) {
    const dark = mode === 'mork';
    const v = T.derive(th[mode], dark);
    const style = Object.entries(v).map(([k, x]) => k + ':' + x).join(';') + ';--radius:' + (parseInt(th.radius, 10) || 0) + 'px;font-family:' + (T.FONTS[th.font] || T.FONTS.system).css;
    const src = logoSrc();
    return `<div class="tm" style="${esc(style)}" aria-label="Forhåndsvisning ${dark ? 'mørkt' : 'lyst'}">
      <div class="tm-top">${src ? `<img src="${esc(src)}" alt="">` : '<span>📘</span>'}<b>${esc(W.navn || 'Arbeidshåndbok')}</b></div>
      <div class="tm-body">
        <div class="tm-card"><b>Slik kobler du til VPN</b><p>Brødtekst med en <a href="#" tabindex="-1">lenke</a> og <span class="tm-muted">dempet tekst</span>.</p>
        <span class="tm-chip">IT</span> <span class="tm-btn">Knapp</span></div>
      </div></div>`;
  }
  function checks(th, mode) {
    const dark = mode === 'mork', c = th[mode];
    const v = T.derive(c, dark);
    const rows = [
      ['Tekst på bakgrunn', v['--text'], v['--bg'], 4.5],
      ['Tekst på kort', v['--text'], v['--surface'], 4.5],
      ['Lenker og hovedfarge på bakgrunn', v['--accent'], v['--bg'], 4.5],
      ['Dempet tekst på bakgrunn', v['--muted'], v['--bg'], 4.5]
    ];
    return rows.map(([n, a, b, min]) => {
      const r = T.contrast(a, b);
      return `<li class="${r >= min ? 'ok' : 'low'}">${r >= min ? '✓' : '⚠'} ${esc(n)}: ${r.toFixed(1)}:1${r < min ? ' – for lav kontrast, kan bli vanskelig å lese' : ''}</li>`;
    }).join('');
  }
  function refresh() {
    const th = theme();
    ['lys', 'mork'].forEach((m) => {
      const pv = $('#pv-' + m), ck = $('#ck-' + m);
      if (pv) pv.innerHTML = mock(th, m);
      if (ck) ck.innerHTML = checks(th, m);
    });
  }

  /* ---------- siden ---------- */
  function draw() {
    const th = theme();
    const isStd = W.standard === th.id;
    root.innerHTML = `
      <div class="ed-bar">
        <button class="btn" id="th-back" type="button">← Tilbake</button>
        <span class="grow"></span>
        <button class="btn primary" id="th-save" type="button">Lagre utseende</button>
      </div>
      <h1>Utseende</h1>
      <p class="hint" style="margin-bottom:14px">Her velger du farger, skrift og logo. Du kan lage flere temaer – leserne kan selv velge mellom dem (og mellom lyst og mørkt), men ikke endre dem. Endringene publiseres sammen med artiklene.</p>

      <div class="ed-form th-form">
        <fieldset><legend>Navn og logo</legend>
          <label>Navn i toppfeltet <input type="text" id="th-name" value="${esc(W.navn)}" maxlength="60"></label>
          <div class="th-logo">
            ${W.logo ? `<img src="${esc(logoSrc())}" alt="Logo" class="th-logo-img">` : '<span class="hint">Ingen logo valgt – bruker 📘.</span>'}
            <button class="btn small" id="th-logo" type="button">${W.logo ? 'Bytt logo' : 'Velg logo'}</button>
            ${W.logo ? '<button class="btn small" id="th-logo-x" type="button">Fjern logo</button>' : ''}
            <input type="file" id="th-logo-file" accept="image/png,image/jpeg,image/gif,image/webp" hidden>
          </div>
          <p class="hint">PNG med gjennomsiktig bakgrunn fungerer best. Logoen gjøres automatisk mindre. Ikonet og navnet på den installerte appen (på hjemskjermen) endres ikke herfra.</p>
        </fieldset>

        <fieldset><legend>Temaer</legend>
          <div class="th-row">
            <label>Tema som redigeres
              <select id="th-sel">${W.temaer.map((x) => `<option value="${esc(x.id)}"${x.id === sel ? ' selected' : ''}>${esc(x.navn)}${W.standard === x.id ? ' (standard)' : ''}</option>`).join('')}</select>
            </label>
            <button class="btn small" id="th-new" type="button">+ Nytt tema (kopi)</button>
            <button class="btn small danger" id="th-del" type="button"${W.temaer.length < 2 ? ' disabled' : ''}>Slett</button>
          </div>
          <label>Navn på temaet <input type="text" id="th-tname" value="${esc(th.navn)}" maxlength="40"></label>
          <label class="inl"><input type="checkbox" id="th-std"${isStd ? ' checked disabled' : ''}> Dette er standardtemaet (det leserne ser først)</label>
          <div class="th-row">
            <label>Skrift <select id="th-font">${Object.entries(T.FONTS).map(([k, f]) => `<option value="${k}"${th.font === k ? ' selected' : ''}>${esc(f.navn)}</option>`).join('')}</select></label>
            <label>Rundede hjørner: <output id="th-rv">${parseInt(th.radius, 10) || 0}</output> px <input type="range" id="th-radius" min="0" max="24" step="1" value="${parseInt(th.radius, 10) || 0}"></label>
          </div>
        </fieldset>

        <div class="th-modes">
          ${[['lys', '☀ Lyst modus'], ['mork', '🌙 Mørkt modus']].map(([m, n]) => `
          <fieldset><legend>${n}</legend>
            ${COLORS.map(([k, label, hint]) => `<label class="th-color"><input type="color" data-m="${m}" data-k="${k}" value="${esc(T.okHex(th[m][k], '#808080'))}"> <span><strong>${label}</strong><small>${hint}</small></span></label>`).join('')}
            <ul class="th-ck" id="ck-${m}"></ul>
            <div id="pv-${m}" class="th-pv"></div>
          </fieldset>`).join('')}
        </div>
        <p><button class="btn small" id="th-reset" type="button">Tilbakestill dette temaet til standardfargene</button></p>
      </div>`;
    refresh();
  }

  function bind() {
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('click', onClick);
  }
  let bound = false;
  function onInput(e) {
    if (!W || !$('#th-save')) return;
    const t = e.target;
    if (t.id === 'th-name') { W.navn = t.value; refresh(); }
    else if (t.id === 'th-tname') { theme().navn = t.value; }
    else if (t.id === 'th-radius') { theme().radius = parseInt(t.value, 10); $('#th-rv').textContent = t.value; refresh(); }
    else if (t.dataset && t.dataset.k) { theme()[t.dataset.m][t.dataset.k] = t.value.toLowerCase(); refresh(); }
  }
  function onChange(e) {
    if (!W || !$('#th-save')) return;
    const t = e.target;
    if (t.id === 'th-sel') { sel = t.value; draw(); }
    else if (t.id === 'th-font') { theme().font = t.value; refresh(); }
    else if (t.id === 'th-std' && t.checked) { W.standard = sel; draw(); }
    else if (t.id === 'th-tname') { draw(); }
    else if (t.id === 'th-logo-file') { const f = t.files[0]; t.value = ''; if (f) setLogo(f); }
  }
  function onClick(e) {
    if (!W || !$('#th-save')) return;
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'th-back') leave();
    else if (b.id === 'th-save') save();
    else if (b.id === 'th-logo') $('#th-logo-file').click();
    else if (b.id === 'th-logo-x') { W.logo = ''; draw(); }
    else if (b.id === 'th-new') {
      const c = clone(theme());
      c.navn = c.navn + ' (kopi)';
      c.id = uniqueId(E.slug(c.navn));
      W.temaer.push(c); sel = c.id; draw();
      $('#th-tname').focus(); $('#th-tname').select();
    } else if (b.id === 'th-del') {
      if (W.temaer.length < 2) return;
      if (!confirm('Slette temaet «' + theme().navn + '»? Lesere som har valgt det, får standardtemaet i stedet.')) return;
      W.temaer = W.temaer.filter((x) => x.id !== sel);
      if (W.standard === sel) W.standard = W.temaer[0].id;
      sel = W.standard; draw();
    } else if (b.id === 'th-reset') {
      const d = T.DEFAULT.temaer[0];
      const th = theme();
      th.lys = clone(d.lys); th.mork = clone(d.mork); th.radius = d.radius; th.font = d.font;
      draw();
    }
  }
  function uniqueId(seed) {
    let id = seed || 'tema', n = 2;
    while (W.temaer.some((x) => x.id === id)) id = seed + '-' + n++;
    return id;
  }

  /* ---------- logo ---------- */
  async function setLogo(file) {
    try {
      if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) throw new Error('Velg et PNG-, JPEG-, GIF- eller WebP-bilde.');
      if (file.size > 15 * 1024 * 1024) throw new Error('Bildet er for stort.');
      let bmp;
      try { bmp = await createImageBitmap(file); } catch (e) { throw new Error('Kunne ikke lese bildet.'); }
      const s = Math.min(1, LOGO_MAX_H / bmp.height, LOGO_MAX_W / bmp.width);
      const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
      const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
      if (!blob) throw new Error('Kunne ikke behandle bildet.');
      const name = 'logo-' + Math.random().toString(36).slice(2, 8) + '.png';
      await E.addPendingBlob(name, blob);
      W.logo = 'bilder/' + name;
      draw();
    } catch (err) {
      toast(err && err.message ? err.message : 'Kunne ikke legge inn logoen.', 7000);
    }
  }

  /* ---------- lagre / forlate ---------- */
  function save() {
    if (!W.navn.trim()) { toast('Skriv inn et navn til toppfeltet.'); $('#th-name').focus(); return; }
    const names = new Set();
    for (const t of W.temaer) {
      const n = t.navn.trim().toLowerCase();
      if (!n) { sel = t.id; draw(); toast('Alle temaer må ha et navn.'); return; }
      if (names.has(n)) { sel = t.id; draw(); toast('To temaer heter «' + t.navn + '». Gi dem ulike navn.'); return; }
      names.add(n);
    }
    W.navn = W.navn.trim();
    W.temaer.forEach((t) => { t.navn = t.navn.trim(); });
    const low = W.temaer.filter((t) => ['lys', 'mork'].some((m) => {
      const v = T.derive(t[m], m === 'mork');
      return T.contrast(v['--text'], v['--bg']) < 3 || T.contrast(v['--text'], v['--surface']) < 3;
    }));
    if (low.length && !confirm('Temaet «' + low[0].navn + '» har så lav kontrast mellom tekst og bakgrunn at teksten kan bli uleselig. Lagre likevel?')) return;
    if (JSON.stringify(W) === JSON.stringify(T.DEFAULT)) delete E.draft.tema; else E.draft.tema = clone(W);
    E.persist();
    startJson = JSON.stringify(W);
    E.renderList();
    toast('Utseendet er lagret i utkastet. Trykk «Publiser» for å legge det ut.', 7000);
  }
  function leave() {
    if (JSON.stringify(W) !== startJson && !confirm('Du har ulagrede endringer i utseendet. Forlate siden uten å lagre?')) return;
    W = null;
    E.renderList();
  }

  function renderTheme() {
    W = clone(E.draft.tema || T.DEFAULT);
    if (!W.temaer.find((x) => x.id === W.standard)) W.standard = W.temaer[0].id;
    sel = W.standard;
    startJson = JSON.stringify(W);
    if (!bound) { bind(); bound = true; }
    draw();
    window.scrollTo(0, 0);
  }

  const prevBar = E.hooks.bar2, prevAfter = E.hooks.after2;
  E.hooks.bar2 = () => (prevBar ? prevBar() : '') + (E.role() === 'editor' ? '' : '<button class="btn" id="themeEd">🎨 Utseende</button>');
  E.hooks.after2 = () => {
    if (prevAfter) prevAfter();
    const b = $('#themeEd');
    if (b) b.onclick = renderTheme;
  };
})();
