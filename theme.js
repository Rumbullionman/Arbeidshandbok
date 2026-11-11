/* Tema (farger, skrift, logo) for håndboken.
   - Hovedadmin lager temaer i editoren. De ligger i `tema` i content/articles.json.
   - Lesere kan bare velge blant temaene og velge lyst/mørkt/automatisk (lagres på enheten). */
(function (g) {
  'use strict';

  const PREF_KEY = 'hb:tema-valg';
  const CACHE_KEY = 'hb:tema-data';
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const FONTS = {
    system: { navn: 'Standard (systemskrift)', css: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
    serif: { navn: 'Med seriffer', css: 'Georgia, "Iowan Old Style", "Times New Roman", serif' },
    rund: { navn: 'Myk og rund', css: '"Trebuchet MS", "Segoe UI", Verdana, sans-serif' }
  };
  const DEFAULT = {
    navn: 'Arbeidshåndbok',
    logo: '',
    standard: 'standard',
    temaer: [{
      id: 'standard', navn: 'Standard', radius: 12, font: 'system',
      lys: { accent: '#1f5f8b', bg: '#f6f8fa', surface: '#ffffff', text: '#1c2630' },
      mork: { accent: '#6db3e0', bg: '#12171c', surface: '#1b232b', text: '#e8edf2' }
    }]
  };

  /* ---------- farger ---------- */
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const hex = (a) => '#' + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v * t + y[i] * (1 - t))); };
  const lum = (h) => {
    const [r, g2, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g2 + 0.0722 * b;
  };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const okHex = (v, fb) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : fb);

  // Gjør de fire valgte fargene om til alle fargene siden bruker.
  function derive(c, dark) {
    const d = DEFAULT.temaer[0][dark ? 'mork' : 'lys'];
    const accent = okHex(c && c.accent, d.accent), bg = okHex(c && c.bg, d.bg);
    const surface = okHex(c && c.surface, d.surface), text = okHex(c && c.text, d.text);
    const onAccent = contrast('#ffffff', accent) >= contrast('#0d1a24', accent) ? '#ffffff' : '#0d1a24';
    return {
      '--bg': bg, '--surface': surface, '--text': text, '--accent': accent, '--accent-text': onAccent,
      '--muted': mix(text, bg, 0.7), '--border': mix(text, bg, 0.14), '--accent-soft': mix(accent, bg, 0.14),
      '--good': dark ? '#66c28a' : '#2b7a4b', '--warn': dark ? '#f0a15c' : '#b4540a'
    };
  }
  const block = (vars) => Object.entries(vars).map(([k, v]) => k + ':' + v).join(';');

  function clean(tema) {
    const t = tema && Array.isArray(tema.temaer) && tema.temaer.length ? tema : DEFAULT;
    return t;
  }
  function pick(tema, prefId) {
    const t = clean(tema);
    return t.temaer.find((x) => x.id === prefId) || t.temaer.find((x) => x.id === t.standard) || t.temaer[0];
  }
  function cssFor(theme) {
    const l = block(derive(theme.lys, false)), d = block(derive(theme.mork, true));
    const radius = Math.max(0, Math.min(24, parseInt(theme.radius, 10)));
    const font = (FONTS[theme.font] || FONTS.system).css;
    return ':root{' + l + ';--radius:' + (isNaN(radius) ? 12 : radius) + 'px;color-scheme:light}'
      + '@media (prefers-color-scheme: dark){:root{' + d + ';color-scheme:dark}}'
      + ':root[data-modus="lys"]{' + l + ';color-scheme:light}'
      + ':root[data-modus="mork"]{' + d + ';color-scheme:dark}'
      + 'body{font-family:' + font + '}';
  }

  /* ---------- lesernes valg ---------- */
  const prefs = {
    get() { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch (e) { return {}; } },
    set(v) { try { localStorage.setItem(PREF_KEY, JSON.stringify(v)); } catch (e) { /* ignorer */ } }
  };
  const isDark = (modus) => modus === 'mork' || (modus !== 'lys' && g.matchMedia && g.matchMedia('(prefers-color-scheme: dark)').matches);

  let current = null;
  function apply(tema) {
    current = clean(tema);
    try { if (tema) localStorage.setItem(CACHE_KEY, JSON.stringify(tema)); } catch (e) { /* ignorer */ }
    const p = prefs.get();
    const theme = pick(current, p.tema);
    let el = document.getElementById('hb-tema');
    if (!el) { el = document.createElement('style'); el.id = 'hb-tema'; document.head.appendChild(el); }
    el.textContent = cssFor(theme);
    const root = document.documentElement;
    if (p.modus === 'lys' || p.modus === 'mork') root.setAttribute('data-modus', p.modus); else root.removeAttribute('data-modus');
    let meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', derive(theme[isDark(p.modus) ? 'mork' : 'lys'], isDark(p.modus))['--accent']);
    brand();
  }
  function brand() {
    const t = current;
    if (!t) return;
    const name = document.getElementById('brandName'), logo = document.getElementById('brandLogo');
    if (name) name.textContent = String(t.navn || DEFAULT.navn).slice(0, 60);
    if (logo) {
      if (t.logo && /^bilder\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(t.logo)) {
        logo.innerHTML = '';
        const im = document.createElement('img');
        im.src = 'content/' + t.logo; im.alt = ''; im.className = 'logo-img';
        logo.appendChild(im);
      } else logo.textContent = '📘';
    }
  }

  /* ---------- velger for lesere ---------- */
  function openPicker() {
    const t = clean(current);
    const p = prefs.get();
    const sel = pick(t, p.tema).id;
    const dlg = document.createElement('dialog');
    dlg.className = 'tema-dlg';
    dlg.setAttribute('aria-label', 'Utseende');
    const esc = g.HBMD ? g.HBMD.esc : (s) => String(s);
    const dark = isDark(p.modus);
    const sw = (th) => ['accent', 'bg', 'surface', 'text'].map((k) => `<i style="background:${okHex((th[dark ? 'mork' : 'lys'] || {})[k], '#888888')}"></i>`).join('');
    dlg.innerHTML = `<form method="dialog">
      <h2>Utseende</h2>
      <fieldset><legend>Lyst eller mørkt</legend>
        ${[['auto', 'Automatisk (følger enheten)'], ['lys', 'Lyst'], ['mork', 'Mørkt']].map(([v, n]) => `<label><input type="radio" name="modus" value="${v}"${(p.modus || 'auto') === v ? ' checked' : ''}> ${n}</label>`).join('')}
      </fieldset>
      ${t.temaer.length > 1 ? `<fieldset><legend>Tema</legend>
        ${t.temaer.map((th) => `<label class="tema-rad"><input type="radio" name="tema" value="${esc(th.id)}"${th.id === sel ? ' checked' : ''}> <span class="sw">${sw(th)}</span> ${esc(th.navn)}</label>`).join('')}
      </fieldset>` : ''}
      <p class="hint">Valget lagres bare på denne enheten.</p>
      <div class="tema-btns"><button class="btn primary" value="ok">Ferdig</button></div></form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('change', (e) => {
      const q = (n) => { const x = dlg.querySelector('input[name="' + n + '"]:checked'); return x ? x.value : null; };
      const next = { ...prefs.get() };
      if (e.target.name === 'modus') next.modus = q('modus');
      if (e.target.name === 'tema') next.tema = q('tema');
      prefs.set(next);
      apply(current);
      if (e.target.name === 'modus') dlg.querySelectorAll('.sw').forEach((s, i) => { s.innerHTML = sw(t.temaer[i]); });
    });
    dlg.addEventListener('close', () => dlg.remove());
    dlg.showModal();
  }

  // Bruk lagret tema med en gang, så siden ikke blinker i feil farger.
  // (Editoren bruker alltid standardfargene, så en uheldig fargevalg aldri gjør den uleselig.)
  if (!(document.body && document.body.classList.contains('editor'))) {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      apply(raw ? JSON.parse(raw) : null);
    } catch (e) { apply(null); }
  }
  document.addEventListener('DOMContentLoaded', brand);

  g.HBTheme = { DEFAULT, FONTS, apply, openPicker, derive, cssFor, contrast, mix, okHex, HEX, clean, pick };
})(window);
