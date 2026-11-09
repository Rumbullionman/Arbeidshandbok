/* Leser en Word-fil (.docx) i nettleseren og gjør den om til håndbokens tekstformat.
   Ingenting sendes ut av nettleseren. Brukes av editor.js via window.HBWord.convert(file, { addImage }). */
(function (g) {
  'use strict';

  const NS = {
    W: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    R: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    A: 'http://schemas.openxmlformats.org/drawingml/2006/main',
    WP: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    MC: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
    V: 'urn:schemas-microsoft-com:vml'
  };
  const MAX_FILE = 25 * 1024 * 1024;       // størrelse på selve .docx-filen
  const MAX_UNPACKED = 80 * 1024 * 1024;   // samlet utpakket størrelse (vern mot «zip-bomber»)
  const IMG_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp' };

  class WordError extends Error {}

  /* ---------- ZIP-leser ---------- */
  async function readZip(buf) {
    const dv = new DataView(buf);
    const u8 = new Uint8Array(buf);
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 22 - 65535); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new WordError('Dette ser ikke ut som en Word-fil (.docx).');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const dec = new TextDecoder();
    const entries = new Map();
    let total = 0;
    for (let n = 0; n < count; n++) {
      if (p + 46 > buf.byteLength || dv.getUint32(p, true) !== 0x02014b50) throw new WordError('Word-filen er skadet.');
      const flags = dv.getUint16(p + 8, true);
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const usize = dv.getUint32(p + 24, true);
      const nlen = dv.getUint16(p + 28, true);
      const elen = dv.getUint16(p + 30, true);
      const clen = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
      total += usize;
      if (total > MAX_UNPACKED) throw new WordError('Word-filen er for stor å lese (utpakket over 80 MB).');
      entries.set(name, { flags, method, csize, usize, off });
      p += 46 + nlen + elen + clen;
    }
    async function read(name) {
      const e = entries.get(name);
      if (!e) return null;
      if (e.flags & 1) throw new WordError('Word-filen er passordbeskyttet. Lagre en ubeskyttet kopi i Word og prøv igjen.');
      if (e.off + 30 > buf.byteLength || dv.getUint32(e.off, true) !== 0x04034b50) throw new WordError('Word-filen er skadet.');
      const start = e.off + 30 + dv.getUint16(e.off + 26, true) + dv.getUint16(e.off + 28, true);
      const data = u8.subarray(start, start + e.csize);
      if (e.method === 0) return data.slice();
      if (e.method !== 8) throw new WordError('Word-filen bruker en komprimering som ikke støttes.');
      if (typeof DecompressionStream === 'undefined') throw new WordError('Nettleseren er for gammel til å lese Word-filer. Oppdater nettleseren.');
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      const reader = stream.getReader();
      const parts = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > Math.max(e.usize, 1) + 1024 || size > MAX_UNPACKED) { reader.cancel(); throw new WordError('Word-filen er skadet.'); }
        parts.push(value);
      }
      const out = new Uint8Array(size);
      let o = 0;
      parts.forEach((c) => { out.set(c, o); o += c.length; });
      return out;
    }
    return { has: (n) => entries.has(n), read };
  }

  /* ---------- XML-hjelpere ---------- */
  function parseXml(bytes) {
    if (!bytes) return null;
    const doc = new DOMParser().parseFromString(new TextDecoder('utf-8').decode(bytes), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new WordError('Word-filen er skadet.');
    return doc;
  }
  const kids = (el, ns, name) => [...el.children].filter((c) => c.localName === name && (!ns || c.namespaceURI === ns));
  const kid = (el, ns, name) => (el ? kids(el, ns, name)[0] || null : null);
  const wattr = (el, name) => (el ? el.getAttributeNS(NS.W, name) || el.getAttribute('w:' + name) || '' : '');
  const rattr = (el, name) => (el ? el.getAttributeNS(NS.R, name) || el.getAttribute('r:' + name) || '' : '');
  const on = (el) => !!el && !/^(0|false|off|none)$/i.test(wattr(el, 'val') || 'true');

  // Gir barna til et element, men går inn i mc:AlternateContent (bruker «Choice») og sdt/smartTag/ins.
  function flat(el) {
    const out = [];
    for (const c of el.children) {
      if (c.namespaceURI === NS.MC && c.localName === 'AlternateContent') {
        const pick = kid(c, NS.MC, 'Choice') || kid(c, NS.MC, 'Fallback');
        if (pick) out.push(...flat(pick));
      } else if (c.namespaceURI === NS.W && c.localName === 'sdt') {
        const content = kid(c, NS.W, 'sdtContent');
        if (content) out.push(...flat(content));
      } else if (c.namespaceURI === NS.W && (c.localName === 'smartTag' || c.localName === 'ins' || c.localName === 'customXml')) {
        out.push(...flat(c));
      } else {
        out.push(c);
      }
    }
    return out;
  }

  /* ---------- stiler og nummerering ---------- */
  function readStyles(doc) {
    const map = new Map();
    if (!doc) return map;
    for (const s of doc.getElementsByTagNameNS(NS.W, 'style')) {
      const id = wattr(s, 'styleId');
      const ppr = kid(s, NS.W, 'pPr');
      const numPr = kid(ppr, NS.W, 'numPr');
      map.set(id, {
        name: (wattr(kid(s, NS.W, 'name'), 'val') || '').toLowerCase(),
        basedOn: wattr(kid(s, NS.W, 'basedOn'), 'val'),
        outline: kid(ppr, NS.W, 'outlineLvl') ? parseInt(wattr(kid(ppr, NS.W, 'outlineLvl'), 'val'), 10) : null,
        numId: numPr && kid(numPr, NS.W, 'numId') ? wattr(kid(numPr, NS.W, 'numId'), 'val') : null,
        ilvl: numPr && kid(numPr, NS.W, 'ilvl') ? parseInt(wattr(kid(numPr, NS.W, 'ilvl'), 'val'), 10) : null
      });
    }
    return map;
  }
  function styleChain(styles, id) {
    const chain = [];
    const seen = new Set();
    while (id && styles.has(id) && !seen.has(id) && chain.length < 12) {
      seen.add(id);
      const s = styles.get(id);
      chain.push(s);
      id = s.basedOn;
    }
    return chain;
  }
  function readNumbering(doc) {
    const abstract = new Map();   // abstractNumId -> Map(ilvl -> numFmt)
    const nums = new Map();       // numId -> abstractNumId
    if (!doc) return { fmt: () => 'bullet' };
    for (const a of doc.getElementsByTagNameNS(NS.W, 'abstractNum')) {
      const lv = new Map();
      for (const l of kids(a, NS.W, 'lvl')) lv.set(parseInt(wattr(l, 'ilvl'), 10), wattr(kid(l, NS.W, 'numFmt'), 'val'));
      abstract.set(wattr(a, 'abstractNumId'), lv);
    }
    for (const n of doc.getElementsByTagNameNS(NS.W, 'num')) {
      nums.set(wattr(n, 'numId'), wattr(kid(n, NS.W, 'abstractNumId'), 'val'));
    }
    return {
      fmt(numId, ilvl) {
        const lv = abstract.get(nums.get(numId));
        return (lv && lv.get(ilvl)) || 'bullet';
      }
    };
  }

  /* ---------- konvertering ---------- */
  async function convert(file, opts) {
    opts = opts || {};
    if (!file || !/\.docx$/i.test(file.name || '')) {
      throw new WordError('Velg en Word-fil som slutter på .docx. Eldre .doc-filer må først lagres på nytt som .docx i Word (Fil → Lagre som).');
    }
    if (file.size > MAX_FILE) throw new WordError('Word-filen er for stor (over 25 MB).');
    const zip = await readZip(await file.arrayBuffer());
    if (!zip.has('word/document.xml')) throw new WordError('Dette ser ikke ut som en Word-fil (.docx).');

    const docXml = parseXml(await zip.read('word/document.xml'));
    const styles = readStyles(parseXml(await zip.read('word/styles.xml')));
    const numbering = readNumbering(parseXml(await zip.read('word/numbering.xml')));
    const rels = new Map();
    const relDoc = parseXml(await zip.read('word/_rels/document.xml.rels'));
    if (relDoc) {
      for (const r of relDoc.getElementsByTagName('Relationship')) {
        rels.set(r.getAttribute('Id'), { target: r.getAttribute('Target') || '', external: r.getAttribute('TargetMode') === 'External' });
      }
    }

    const stats = { images: 0, skippedImages: 0, tables: 0, links: 0, headings: 0, lists: 0 };
    const imgCache = new Map();

    async function loadImage(rid, alt) {
      const rel = rels.get(rid);
      if (!rel || rel.external) { stats.skippedImages++; return null; }
      if (imgCache.has(rid)) return imgCache.get(rid) ? { name: imgCache.get(rid), alt } : null;
      let path = rel.target.replace(/^\/+/, '');
      path = path.startsWith('word/') ? path : 'word/' + path;
      const parts = [];
      for (const seg of path.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
      path = parts.join('/');
      const ext = (path.split('.').pop() || '').toLowerCase();
      if (!IMG_TYPES[ext] || !zip.has(path)) { stats.skippedImages++; imgCache.set(rid, null); return null; }
      try {
        const bytes = await zip.read(path);
        const f = new File([bytes], path.split('/').pop(), { type: IMG_TYPES[ext] });
        const name = await opts.addImage(f);
        imgCache.set(rid, name);
        stats.images++;
        return { name, alt };
      } catch (e) {
        stats.skippedImages++;
        imgCache.set(rid, null);
        return null;
      }
    }

    const cleanText = (s) => s.replace(/\*/g, '∗');

    // Inline innhold i et avsnitt: liste med segmenter {text,b,i,href} og bilder {img}
    async function inlineItems(p, allowImages) {
      const items = [];
      async function run(r, href) {
        const rpr = kid(r, NS.W, 'rPr');
        const fmt = { b: on(kid(rpr, NS.W, 'b')), i: on(kid(rpr, NS.W, 'i')), href };
        for (const c of flat(r)) {
          if (c.namespaceURI !== NS.W) continue;
          if (c.localName === 't') items.push({ ...fmt, text: c.textContent });
          else if (c.localName === 'tab') items.push({ ...fmt, text: ' ' });
          else if (c.localName === 'br' || c.localName === 'cr') items.push({ ...fmt, text: ' ' });
          else if (c.localName === 'noBreakHyphen') items.push({ ...fmt, text: '-' });
          else if (c.localName === 'drawing' || c.localName === 'pict') {
            const blips = [...c.getElementsByTagNameNS(NS.A, 'blip')].map((b) => ({ rid: rattr(b, 'embed') }));
            const vml = [...c.getElementsByTagNameNS(NS.V, 'imagedata')].map((b) => ({ rid: rattr(b, 'id') }));
            const docPr = c.getElementsByTagNameNS(NS.WP, 'docPr')[0];
            const alt = docPr ? (docPr.getAttribute('descr') || '').trim() : '';
            for (const b of [...blips, ...vml]) {
              if (!b.rid) { stats.skippedImages++; continue; }
              if (!allowImages) { stats.skippedImages++; continue; }
              const im = await loadImage(b.rid, alt);
              if (im) items.push({ img: im });
            }
          }
        }
      }
      async function walk(el, href) {
        for (const c of flat(el)) {
          if (c.namespaceURI !== NS.W) continue;
          if (c.localName === 'r') await run(c, href);
          else if (c.localName === 'hyperlink') {
            let h = href;
            const rel = rattr(c, 'id') ? rels.get(rattr(c, 'id')) : null;
            if (rel && rel.external && /^(https?:\/\/|mailto:|tel:)/i.test(rel.target)) h = rel.target;
            await walk(c, h);
          } else if (c.localName === 'fldSimple') await walk(c, href);
        }
      }
      await walk(p, null);
      return items;
    }

    function renderSegments(items) {
      // slå sammen like etterfølgende segmenter
      const segs = [];
      for (const it of items) {
        if (it.img) continue;
        const last = segs[segs.length - 1];
        if (last && last.b === it.b && last.i === it.i && last.href === it.href) last.text += it.text;
        else segs.push({ ...it });
      }
      const fmtSeg = (s) => {
        const m = s.text.match(/^(\s*)([\s\S]*?)(\s*)$/);
        if (!m[2]) return s.text;
        let t = cleanText(m[2]);
        if (s.b && s.i) t = '***' + t + '***';
        else if (s.b) t = '**' + t + '**';
        else if (s.i) t = '*' + t + '*';
        return m[1] + t + m[3];
      };
      let out = '';
      for (let k = 0; k < segs.length;) {
        const href = segs[k].href;
        let j = k;
        let text = '';
        while (j < segs.length && segs[j].href === href) { text += fmtSeg(segs[j]); j++; }
        if (href && text.trim()) {
          const m = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
          const url = href.replace(/\s/g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\|/g, '%7C');
          const label = m[2].replace(/[[\]]/g, '');
          out += m[1] + '[' + label + '](' + url + ')' + m[3];
          stats.links++;
        } else out += text;
        k = j;
      }
      return out.replace(/\s+/g, ' ').trim();
    }

    function paraInfo(p) {
      const ppr = kid(p, NS.W, 'pPr');
      const styleId = wattr(kid(ppr, NS.W, 'pStyle'), 'val');
      const chain = styleChain(styles, styleId);
      const names = chain.map((s) => s.name);
      let heading = 0, title = false;
      for (const n of names) {
        let m;
        if (!title && /^(title|tittel)$/.test(n)) title = true;
        if (!heading && (m = n.match(/^(?:heading|overskrift)\s*(\d)/))) heading = parseInt(m[1], 10);
      }
      if (!heading && !title) {
        let ol = kid(ppr, NS.W, 'outlineLvl') ? parseInt(wattr(kid(ppr, NS.W, 'outlineLvl'), 'val'), 10) : null;
        if (ol === null) { const s = chain.find((x) => x.outline !== null); if (s) ol = s.outline; }
        if (ol !== null && ol >= 0 && ol <= 5) heading = ol + 1;
      }
      let numId = null, ilvl = 0;
      const numPr = kid(ppr, NS.W, 'numPr');
      if (numPr) {
        if (kid(numPr, NS.W, 'numId')) numId = wattr(kid(numPr, NS.W, 'numId'), 'val');
        if (kid(numPr, NS.W, 'ilvl')) ilvl = parseInt(wattr(kid(numPr, NS.W, 'ilvl'), 'val'), 10) || 0;
      }
      if (numId === null) {
        const s = chain.find((x) => x.numId !== null);
        if (s) { numId = s.numId; if (numPr === null || !kid(numPr, NS.W, 'ilvl')) ilvl = s.ilvl || 0; }
      }
      if (numId === '0') numId = null;
      return { heading, title, numId, ilvl };
    }

    const blocks = [];   // {t:'p'|'h'|'li'|'table'|'img', text}
    let docTitle = '';
    let h1Count = 0;

    async function paragraph(p, inTable) {
      const info = paraInfo(p);
      const items = await inlineItems(p, !inTable);
      const text = renderSegments(items);
      const imgs = items.filter((x) => x.img).map((x) => x.img);
      if (inTable) return text;
      if (text) {
        if (info.title) {
          if (!docTitle && !blocks.length) docTitle = text.replace(/\*+/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim();
          else { blocks.push({ t: 'h', text: '## ' + text }); stats.headings++; }
        } else if (info.heading) {
          const plain = text.replace(/\*+/g, '');
          if (info.heading === 1) h1Count++;
          blocks.push({ t: 'h', text: (info.heading === 1 ? '## ' : '### ') + plain, h1: info.heading === 1 });
          stats.headings++;
        } else if (info.numId !== null) {
          const ordered = !/^(bullet|none)$/.test(numbering.fmt(info.numId, info.ilvl));
          blocks.push({ t: 'li', ordered, key: info.numId + ':' + info.ilvl, indent: Math.min(info.ilvl, 3), text });
        } else {
          blocks.push({ t: 'p', text: /^(#{1,3}\s|>|\||!\[|[-*]\s|\d+[.)]\s)/.test(text) ? '​' + text : text });
        }
      }
      for (const im of imgs) blocks.push({ t: 'img', text: '![' + im.alt.replace(/[[\]\n]/g, ' ').trim() + '](bilder/' + im.name + ')' });
      return null;
    }

    async function table(tbl) {
      const rows = [];
      for (const tr of flat(tbl).filter((x) => x.namespaceURI === NS.W && x.localName === 'tr')) {
        const cells = [];
        for (const tc of flat(tr).filter((x) => x.namespaceURI === NS.W && x.localName === 'tc')) {
          const tcPr = kid(tc, NS.W, 'tcPr');
          const span = parseInt(wattr(kid(tcPr, NS.W, 'gridSpan'), 'val'), 10) || 1;
          const texts = [];
          for (const c of flat(tc)) {
            if (c.namespaceURI !== NS.W) continue;
            if (c.localName === 'p') { const t = await paragraph(c, true); if (t) texts.push(t); }
            else if (c.localName === 'tbl') {
              for (const p of c.getElementsByTagNameNS(NS.W, 'p')) { const t = await paragraph(p, true); if (t) texts.push(t); }
            }
          }
          cells.push(texts.join(' ').replace(/\|/g, '/'));
          for (let k = 1; k < Math.min(span, 20); k++) cells.push('');
        }
        if (cells.some((c) => c.trim())) rows.push(cells);
      }
      if (!rows.length) return;
      const cols = Math.min(Math.max(...rows.map((r) => r.length)), 20);
      const line = (r) => '| ' + Array.from({ length: cols }, (_, k) => r[k] || ' ').join(' | ') + ' |';
      const out = [line(rows[0]), '|' + Array(cols).fill('---').join('|') + '|', ...rows.slice(1).map(line)];
      blocks.push({ t: 'table', text: out.join('\n') });
      stats.tables++;
    }

    const body = docXml.getElementsByTagNameNS(NS.W, 'body')[0];
    if (!body) throw new WordError('Fant ikke noe innhold i Word-filen.');
    for (const c of flat(body)) {
      if (c.namespaceURI !== NS.W) continue;
      if (c.localName === 'p') await paragraph(c, false);
      else if (c.localName === 'tbl') await table(c);
    }

    // En enkelt toppoverskrift først i dokumentet brukes som artikkeltittel
    if (!docTitle && h1Count === 1 && blocks.length && blocks[0].t === 'h' && blocks[0].h1) {
      docTitle = blocks[0].text.replace(/^#+\s*/, '').trim();
      blocks.shift();
      stats.headings--;
    }

    // Sett sammen: listepunkter hører sammen, resten skilles med tom linje
    const out = [];
    const counters = new Map();
    let prev = null;
    for (const b of blocks) {
      let line = b.text;
      if (b.t === 'li') {
        if (!prev || prev.t !== 'li') { counters.clear(); stats.lists++; }
        const n = (counters.get(b.key) || 0) + 1;
        counters.set(b.key, n);
        // dypere nivåer nullstilles når vi går opp
        for (const k of [...counters.keys()]) { if (parseInt(k.split(':')[1], 10) > b.indent && k !== b.key) counters.delete(k); }
        line = '  '.repeat(b.indent) + (b.ordered ? n + '. ' : '- ') + b.text;
        out.push(prev && prev.t === 'li' ? '\n' + line : '\n\n' + line);
      } else {
        out.push(out.length ? '\n\n' + line : line);
      }
      prev = b;
    }
    let md = out.join('').replace(/^\n+/, '');
    md = md.replace(/\n{3,}/g, '\n\n');
    // «- » i bunnen av listen skal ikke smelte sammen med neste avsnitt: sikres av tom linje over.
    return { title: docTitle.slice(0, 120), body: md.trim(), stats };
  }

  g.HBWord = { convert, WordError };
})(window);
