/* Felles tekstformatering for håndboken og editoren. */
(function (g) {
  'use strict';

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  /* ---------- enkel markdown ---------- */
  function inline(text) {
    let t = esc(text);
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
      if (!/^(https?:|mailto:|tel:|#\/)/.test(url)) return label;
      const external = /^https?:/.test(url);
      return `<a href="${url}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
    });
    return t;
  }

  /* ---------- bilder ---------- */
  // Bilder ligger i content/bilder/ og skrives slik i teksten: ![Beskrivelse](bilder/navn.jpg)
  const IMG_REL = /^bilder\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
  function imageUrl(path) {
    if (IMG_REL.test(path)) return 'content/' + path;
    if (/^https:\/\/[^\s"'<>]+$/.test(path)) return path;
    return null;
  }
  function imageNames(body) {
    const out = [];
    String(body || '').replace(/^!\[[^\]]*\]\((bilder\/[A-Za-z0-9][A-Za-z0-9._-]*)\)(?:\{lenker:[^}\n]*\})?\s*$/gm, (m, p) => { out.push(p); return m; });
    return out;
  }

  /* Klikkbare områder i bilder. Skrives rett etter bildet: ![Meny](bilder/meny.jpg){lenker: vpn@5,10,30,20; ferie@40,10,30,20}
     Tallene er venstre, topp, bredde og høyde i prosent av bildet. */
  const AREA_RE = /^([A-Za-z0-9-]+)@(\d{1,3}(?:\.\d)?),(\d{1,3}(?:\.\d)?),(\d{1,3}(?:\.\d)?),(\d{1,3}(?:\.\d)?)$/;
  function parseAreas(str) {
    const out = [];
    String(str || '').split(';').forEach((part) => {
      const m = part.trim().match(AREA_RE);
      if (!m) return;
      const [x, y, w, h] = m.slice(2).map(Number);
      if (w < 1 || h < 1 || x + w > 100.5 || y + h > 100.5) return;
      out.push({ id: m[1], x, y, w, h });
    });
    return out;
  }
  const r1 = (n) => String(Math.round(n * 10) / 10);
  function formatAreas(areas) {
    return areas.length ? '{lenker: ' + areas.map((a) => a.id + '@' + [a.x, a.y, a.w, a.h].map(r1).join(',')).join('; ') + '}' : '';
  }

  // opts.imageSrc(path) lar editoren vise bilder som ikke er publisert ennå.
  function markdown(src, opts) {
    const lines = String(src || '').replace(/\r/g, '').split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }

      let m;
      if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
        const level = m[1].length + 1; // # i brødtekst blir h2
        out.push(`<h${level}>${inline(m[2])}</h${level}>`);
        i++; continue;
      }
      if ((m = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)(?:\{lenker:([^}]*)\})?\s*$/))) {
        const local = opts && opts.imageSrc && IMG_REL.test(m[2]) ? opts.imageSrc(m[2]) : null;
        const url = local || imageUrl(m[2]);
        if (url) {
          const titleOf = opts && opts.titleOf;
          const areas = m[3] && titleOf ? parseAreas(m[3]).map((a) => ({ ...a, title: titleOf(a.id) })).filter((a) => a.title) : [];
          const img = `<img src="${esc(url)}" alt="${esc(m[1])}" loading="lazy">`;
          const cap = m[1] ? `<figcaption>${esc(m[1])}</figcaption>` : '';
          if (!areas.length) out.push(`<figure>${img}${cap}</figure>`);
          else {
            out.push(`<figure><div class="imgmap">${img}` + areas.map((a) =>
              `<a class="hot" href="#/artikkel/${a.id}" style="left:${a.x}%;top:${a.y}%;width:${a.w}%;height:${a.h}%" title="${esc(a.title)}" aria-label="${esc(a.title)}"></a>`).join('')
              + `</div>${cap}<p class="hot-list">Trykk i bildet, eller velg her: ${areas.map((a) => `<a class="hot" href="#/artikkel/${a.id}">${esc(a.title)}</a>`).join(' · ')}</p></figure>`);
          }
        }
        i++; continue;
      }
      if (/^\|.*\|\s*$/.test(line)) {
        const rows = [];
        while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) { rows.push(lines[i]); i++; }
        const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        const body = rows.filter((r) => !/^\|\s*:?-{2,}/.test(r));
        const head = cells(body[0] || '');
        const rest = body.slice(1).map(cells);
        out.push('<table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
          rest.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
          '</tbody></table>');
        continue;
      }
      if (/^>\s?/.test(line)) {
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
        let cls = '';
        if (buf[0] && buf[0].startsWith('!')) { cls = ' class="warn"'; buf[0] = buf[0].replace(/^!\s*/, ''); }
        out.push(`<blockquote${cls}>${inline(buf.join(' '))}</blockquote>`);
        continue;
      }
      if (/^\s*[-*]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++; }
        out.push('<ul>' + items.map((x) => `<li>${inline(x)}</li>`).join('') + '</ul>');
        continue;
      }
      if (/^\s*\d+[.)]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.)]\s+/, '')); i++; }
        out.push('<ol>' + items.map((x) => `<li>${inline(x)}</li>`).join('') + '</ol>');
        continue;
      }
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>|\s*[-*]\s|\s*\d+[.)]\s|\||!\[)/.test(lines[i])) { para.push(lines[i]); i++; }
      out.push(`<p>${inline(para.join(' '))}</p>`);
    }
    return out.join('\n');
  }

  g.HBMD = { esc: esc, markdown: markdown, imageNames: imageNames, parseAreas: parseAreas, formatAreas: formatAreas };
})(window);
