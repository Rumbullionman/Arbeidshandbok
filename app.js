(() => {
  'use strict';

  const DATA_URL = 'content/articles.json';
  const KEYS = { data: 'hb:data', seen: 'hb:seen', fav: 'hb:fav' };
  const CHECK_EVERY_MS = 30 * 60 * 1000;

  const $ = (s) => document.querySelector(s);
  const app = $('#app');

  let data = null;
  let category = 'Alle';
  let query = '';
  let lastCheck = 0;

  /* ---------- lagring ---------- */
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* full eller blokkert */ }
    }
  };

  const favs = () => new Set(store.get(KEYS.fav, []));
  const saveFavs = (set) => store.set(KEYS.fav, [...set]);

  function initSeen(articles) {
    if (store.get(KEYS.seen, null) === null) {
      const seen = {};
      articles.forEach((a) => { seen[a.id] = a.updated; });
      store.set(KEYS.seen, seen);
    }
  }
  const markSeen = (a) => {
    const seen = store.get(KEYS.seen, {});
    seen[a.id] = a.updated;
    store.set(KEYS.seen, seen);
  };
  function badgeFor(a) {
    const seen = store.get(KEYS.seen, {});
    if (!(a.id in seen)) return 'Ny';
    if (seen[a.id] !== a.updated) return 'Oppdatert';
    return '';
  }

  /* ---------- hjelpere ---------- */
  const { esc, markdown } = window.HBMD;

  function fmtDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return iso || '';
    return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  let toastTimer;
  function toast(msg, ms = 4500) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  }

  function setStatus(state) {
    const el = $('#status');
    const online = navigator.onLine;
    const s = state || (online ? 'online' : 'offline');
    el.dataset.state = s;
    el.textContent = s === 'checking' ? 'Sjekker …' : s === 'online' ? 'Online' : 'Offline – lagret versjon';
  }

  /* ---------- søk ---------- */
  function score(a, terms) {
    const title = a.title.toLowerCase();
    const summary = (a.summary || '').toLowerCase();
    const tags = (a.tags || []).join(' ').toLowerCase();
    const body = (a.body || '').toLowerCase();
    let total = 0;
    for (const t of terms) {
      let s = 0;
      if (title.includes(t)) s += 10;
      if (tags.includes(t)) s += 6;
      if (summary.includes(t)) s += 4;
      if (body.includes(t)) s += 1;
      if (!s) return 0; // alle ord må treffe
      total += s;
    }
    return total;
  }

  /* ---------- visninger ---------- */
  function card(a, favSet) {
    const badge = badgeFor(a);
    return `<a class="card" href="#/artikkel/${encodeURIComponent(a.id)}">
      <h3>${favSet.has(a.id) ? '<span class="star" aria-label="Favoritt">★</span> ' : ''}${esc(a.title)}</h3>
      <p>${esc(a.summary || '')}</p>
      <div class="meta"><span class="tag">${esc(a.category)}</span>${badge ? `<span class="badge-new">${badge}</span>` : ''}<span>Oppdatert ${fmtDate(a.updated)}</span></div>
    </a>`;
  }

  function renderList() {
    const listEl = $('#list');
    if (!listEl) return;
    const favSet = favs();
    let items = data.articles.slice();

    if (category === 'Favoritter') items = items.filter((a) => favSet.has(a.id));
    else if (category !== 'Alle') items = items.filter((a) => a.category === category);

    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length) {
      items = items.map((a) => ({ a, s: score(a, terms) })).filter((x) => x.s > 0)
        .sort((x, y) => y.s - x.s).map((x) => x.a);
      listEl.innerHTML = items.length
        ? `<div class="cards">${items.map((a) => card(a, favSet)).join('')}</div>`
        : '<p class="empty">Ingen treff. Prøv et annet ord.</p>';
      return;
    }

    if (!items.length) {
      listEl.innerHTML = category === 'Favoritter'
        ? '<p class="empty">Ingen favoritter ennå. Åpne en artikkel og trykk ★ for å lagre den her.</p>'
        : '<p class="empty">Ingen artikler her ennå.</p>';
      return;
    }

    if (category === 'Alle') {
      const order = data.categories && data.categories.length ? data.categories : [...new Set(items.map((a) => a.category))];
      const groups = order.map((c) => [c, items.filter((a) => a.category === c)]).filter(([, l]) => l.length);
      listEl.innerHTML = groups.map(([c, l]) =>
        `<h2 class="section-title">${esc(c)}</h2><div class="cards">${l.map((a) => card(a, favSet)).join('')}</div>`
      ).join('');
    } else {
      listEl.innerHTML = `<div class="cards">${items.map((a) => card(a, favSet)).join('')}</div>`;
    }
  }

  function renderChips() {
    const el = $('#chips');
    if (!el) return;
    const names = ['Alle', 'Favoritter', ...(data.categories || [...new Set(data.articles.map((a) => a.category))])];
    el.innerHTML = names.map((n) =>
      `<button class="chip" data-cat="${esc(n)}" aria-pressed="${n === category}">${n === 'Favoritter' ? '★ ' : ''}${esc(n)}</button>`
    ).join('');
  }

  function renderHome() {
    document.title = 'Arbeidshåndbok';
    app.innerHTML = `
      <div class="search"><input id="q" type="search" placeholder="Søk i håndboken, f.eks. «ferie» eller «vpn»" aria-label="Søk i håndboken" autocomplete="off" value="${esc(query)}"></div>
      <div class="chips" id="chips" role="group" aria-label="Kategorier"></div>
      <div id="list"></div>`;
    renderChips();
    renderList();
    $('#q').addEventListener('input', (e) => { query = e.target.value; renderList(); });
    $('#chips').addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      category = b.dataset.cat;
      renderChips();
      renderList();
    });
  }

  function renderArticle(id) {
    const a = data.articles.find((x) => x.id === id);
    if (!a) {
      app.innerHTML = '<a class="back" href="#/">← Tilbake</a><p class="empty">Fant ikke artikkelen. Den kan ha blitt fjernet eller flyttet.</p>';
      return;
    }
    document.title = a.title + ' – Arbeidshåndbok';
    const favSet = favs();
    const related = (a.related || []).map((rid) => data.articles.find((x) => x.id === rid)).filter(Boolean);
    app.innerHTML = `
      <a class="back" href="#/">← Til oversikten</a>
      <article class="article">
        <div class="meta"><span class="tag">${esc(a.category)}</span><span>Oppdatert ${fmtDate(a.updated)}</span></div>
        <h1>${esc(a.title)}</h1>
        <div class="article-actions">
          <button class="btn" id="favBtn" aria-pressed="${favSet.has(a.id)}">${favSet.has(a.id) ? '★ Favoritt' : '☆ Lagre som favoritt'}</button>
          <button class="btn" id="printBtn">Skriv ut</button>
        </div>
        ${markdown(a.body)}
      </article>
      ${related.length ? `<h2 class="section-title">Se også</h2><div class="cards">${related.map((r) => card(r, favSet)).join('')}</div>` : ''}`;
    markSeen(a);
    window.scrollTo(0, 0);
    $('#favBtn').addEventListener('click', (e) => {
      const set = favs();
      if (set.has(a.id)) set.delete(a.id); else set.add(a.id);
      saveFavs(set);
      const on = set.has(a.id);
      e.currentTarget.textContent = on ? '★ Favoritt' : '☆ Lagre som favoritt';
      e.currentTarget.setAttribute('aria-pressed', on);
    });
    $('#printBtn').addEventListener('click', () => window.print());
  }

  function renderMeta() {
    if (!data) return;
    $('#meta').textContent = `Innhold ${data.version || ''} · ${data.articles.length} artikler · oppdatert ${fmtDate(data.updated)}`;
  }

  function route() {
    if (!data) return;
    const m = location.hash.match(/^#\/artikkel\/(.+)$/);
    if (m) renderArticle(decodeURIComponent(m[1]));
    else renderHome();
  }

  /* ---------- henting og oppdatering ---------- */
  const sig = (a) => JSON.stringify([a.title, a.category, a.summary, a.updated, a.body]);

  function valid(json) {
    return json && Array.isArray(json.articles) && json.articles.every((a) => a && a.id && a.title && a.category);
  }

  async function fetchData() {
    const res = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (!valid(json)) throw new Error('Ugyldig innholdsfil');
    return json;
  }

  async function checkForUpdates(manual) {
    if (!navigator.onLine) {
      setStatus('offline');
      if (manual) toast('Du er offline. Viser lagret innhold.');
      return;
    }
    setStatus('checking');
    lastCheck = Date.now();
    try {
      const fresh = await fetchData();
      const old = data;
      const oldMap = new Map(old ? old.articles.map((a) => [a.id, sig(a)]) : []);
      const changed = fresh.articles.filter((a) => oldMap.get(a.id) !== sig(a));
      const removed = old ? old.articles.filter((a) => !fresh.articles.some((x) => x.id === a.id)).length : 0;

      data = fresh;
      store.set(KEYS.data, fresh);
      initSeen(fresh.articles);
      renderMeta();

      if (old && (changed.length || removed)) {
        const added = changed.filter((a) => !oldMap.has(a.id)).length;
        const updated = changed.length - added;
        const parts = [];
        if (added) parts.push(`${added} ny${added > 1 ? 'e' : ''}`);
        if (updated) parts.push(`${updated} oppdatert${updated > 1 ? 'e' : ''}`);
        if (removed) parts.push(`${removed} fjernet`);
        toast('Håndboken er oppdatert: ' + parts.join(', ') + '.');
        const typing = document.activeElement && document.activeElement.id === 'q';
        if (!typing) route();
      } else if (manual) {
        toast('Du har siste versjon.');
      }
    } catch (err) {
      if (manual) toast('Kunne ikke hente oppdateringer. Viser lagret innhold.');
    } finally {
      setStatus();
    }
  }

  async function start() {
    setStatus();
    const stored = store.get(KEYS.data, null);
    if (valid(stored)) {
      data = stored;
      initSeen(data.articles);
      renderMeta();
      route();
      checkForUpdates(false);
      return;
    }
    // første gang: hent innholdet (service worker kan svare fra hurtigbuffer)
    try {
      data = await fetchData();
      store.set(KEYS.data, data);
      initSeen(data.articles);
      renderMeta();
      route();
    } catch (err) {
      app.innerHTML = `<p class="empty">Håndboken kunne ikke lastes. Koble til nett første gang du åpner den, så blir innholdet lagret for offline bruk.</p>
        <p class="empty"><button class="btn primary" id="retry">Prøv igjen</button></p>`;
      $('#retry').addEventListener('click', () => location.reload());
    }
  }

  /* ---------- hendelser ---------- */
  window.addEventListener('hashchange', route);
  window.addEventListener('online', () => { setStatus(); checkForUpdates(false); });
  window.addEventListener('offline', () => setStatus());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastCheck > CHECK_EVERY_MS) checkForUpdates(false);
  });
  setInterval(() => { if (document.visibilityState === 'visible') checkForUpdates(false); }, CHECK_EVERY_MS);
  $('#refreshBtn').addEventListener('click', () => checkForUpdates(true));

  // installer som app
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $('#installBtn').hidden = false;
  });
  $('#installBtn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $('#installBtn').hidden = true;
  });
  window.addEventListener('appinstalled', () => { $('#installBtn').hidden = true; toast('Håndboken er installert.'); });

  // service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register('sw.js').catch(() => {});
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadController) toast('Appen er oppdatert. Last siden på nytt for siste versjon.', 8000);
      });
    });
  }

  start();
})();
