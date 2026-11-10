/* Dialog for å tegne klikkbare områder på et bilde og koble hvert område til en artikkel.
   window.HBMap.open({ items:[{alt, src, areas}], index, articles:[{id,title}], onSave(index, areas) }) */
(function (g) {
  'use strict';
  const esc = g.HBMD.esc;
  const MIN = 3; // minste område i prosent

  function open(opts) {
    const items = opts.items;
    let cur = Math.min(Math.max(opts.index || 0, 0), items.length - 1);
    let areas = [];
    const known = new Set(opts.articles.map((a) => a.id));

    const dlg = document.createElement('dialog');
    dlg.className = 'map-dlg';
    dlg.setAttribute('aria-label', 'Lag klikkbare områder i bildet');
    dlg.innerHTML = `
      <form method="dialog" class="map-form" novalidate>
        <h2>Klikkbare områder i bildet</h2>
        <p class="hint">Dra over bildet for å tegne et område (med finger eller mus). Velg deretter hvilken artikkel området skal sende leseren til.</p>
        ${items.length > 1 ? '<label>Bilde <select id="mapImg">' + items.map((it, i) => `<option value="${i}">${esc(it.alt || 'Bilde ' + (i + 1))}</option>`).join('') + '</select></label>' : ''}
        <div class="map-canvas" id="mapCanvas"><img id="mapPic" alt="" draggable="false"></div>
        <ol class="map-areas" id="mapAreas"></ol>
        <p class="map-msg" id="mapMsg" role="alert" hidden></p>
        <div class="map-btns">
          <button type="button" class="btn" id="mapClear">Fjern alle områder</button>
          <span class="grow"></span>
          <button type="button" class="btn" id="mapCancel">Avbryt</button>
          <button type="button" class="btn primary" id="mapSave">Bruk</button>
        </div>
      </form>`;
    document.body.appendChild(dlg);
    const $ = (s) => dlg.querySelector(s);
    const canvas = $('#mapCanvas'), pic = $('#mapPic');

    const optionsHtml = (sel) => '<option value="">Velg artikkel …</option>'
      + opts.articles.map((a) => `<option value="${esc(a.id)}"${a.id === sel ? ' selected' : ''}>${esc(a.title)}</option>`).join('')
      + (sel && !known.has(sel) ? `<option value="${esc(sel)}" selected>(artikkelen finnes ikke: ${esc(sel)})</option>` : '');

    function draw() {
      canvas.querySelectorAll('.map-rect').forEach((r) => r.remove());
      areas.forEach((a, i) => {
        const r = document.createElement('div');
        r.className = 'map-rect' + (a.id && known.has(a.id) ? '' : ' empty');
        r.style.cssText = `left:${a.x}%;top:${a.y}%;width:${a.w}%;height:${a.h}%`;
        r.textContent = i + 1;
        canvas.appendChild(r);
      });
      $('#mapAreas').innerHTML = areas.map((a, i) => `<li data-i="${i}"><span class="map-n">${i + 1}</span>
        <select aria-label="Artikkel for område ${i + 1}">${optionsHtml(a.id)}</select>
        <button type="button" class="btn small" data-del="${i}" aria-label="Fjern område ${i + 1}">✕</button></li>`).join('')
        || '<li class="hint">Ingen områder ennå.</li>';
    }
    function load(i) {
      cur = i;
      areas = items[i].areas.map((a) => ({ ...a }));
      pic.src = items[i].src;
      pic.alt = items[i].alt || '';
      $('#mapMsg').hidden = true;
      draw();
    }

    // tegning
    let start = null, band = null;
    const pt = (e) => {
      const b = pic.getBoundingClientRect();
      return { x: Math.min(100, Math.max(0, (e.clientX - b.left) / b.width * 100)), y: Math.min(100, Math.max(0, (e.clientY - b.top) / b.height * 100)) };
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      start = pt(e);
      band = document.createElement('div');
      band.className = 'map-rect band';
      canvas.appendChild(band);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!start) return;
      const p = pt(e);
      band.style.cssText = `left:${Math.min(start.x, p.x)}%;top:${Math.min(start.y, p.y)}%;width:${Math.abs(p.x - start.x)}%;height:${Math.abs(p.y - start.y)}%`;
    });
    const end = (e) => {
      if (!start) return;
      const p = pt(e);
      band.remove(); band = null;
      const a = { id: '', x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
      start = null;
      if (a.w < MIN || a.h < MIN) return;
      areas.push({ ...a, x: Math.round(a.x * 10) / 10, y: Math.round(a.y * 10) / 10, w: Math.round(a.w * 10) / 10, h: Math.round(a.h * 10) / 10 });
      draw();
      const sels = dlg.querySelectorAll('#mapAreas select');
      if (sels.length) sels[sels.length - 1].focus();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', () => { if (band) band.remove(); band = null; start = null; });

    $('#mapAreas').addEventListener('change', (e) => {
      const li = e.target.closest('li[data-i]');
      if (li) { areas[+li.dataset.i].id = e.target.value; draw(); }
    });
    $('#mapAreas').addEventListener('click', (e) => {
      const b = e.target.closest('[data-del]');
      if (b) { areas.splice(+b.dataset.del, 1); draw(); }
    });
    $('#mapClear').onclick = () => { areas = []; draw(); };
    if ($('#mapImg')) { $('#mapImg').value = String(cur); $('#mapImg').onchange = (e) => load(+e.target.value); }
    const close = () => { dlg.close(); dlg.remove(); };
    $('#mapCancel').onclick = close;
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    $('#mapSave').onclick = () => {
      const bad = areas.findIndex((a) => !a.id || !known.has(a.id));
      if (bad >= 0) {
        const m = $('#mapMsg');
        m.textContent = 'Velg en artikkel for område ' + (bad + 1) + ', eller fjern området.';
        m.hidden = false;
        return;
      }
      opts.onSave(cur, areas.map((a) => ({ ...a })));
      close();
    };
    load(cur);
    dlg.showModal();
  }

  g.HBMap = { open: open };
})(window);
