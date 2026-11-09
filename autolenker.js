/* Finner steder i teksten som nevner andre artikler, og gjør dem om til lenker.
   window.HBLink.autoLink(body, articles, selfId) -> { text, count, links: [{id, text}] } */
(function (g) {
  'use strict';

  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const LETTER = '\\p{L}\\p{N}';
  const SUFFIX = '(?:ene|er|en|et|a|s)?';

  function termsFor(a) {
    const set = new Set();
    const add = (t) => { t = (t || '').trim(); if (t.length >= 3) set.add(t); };
    add(a.title);
    add((a.title || '').replace(/\s*\([^)]*\)\s*/g, ' '));
    (a.tags || []).forEach(add);
    return [...set].sort((x, y) => y.length - x.length);
  }

  // Deler av teksten som ikke skal røres: koder, eksisterende lenker, nettadresser, bildelinjer, overskrifter, tabellskille
  function protectedRanges(text) {
    const ranges = [];
    const push = (re) => { let m; while ((m = re.exec(text))) ranges.push([m.index, m.index + m[0].length]); };
    push(/^#{1,3}\s.*$/gm);
    push(/^!\[[^\n]*$/gm);
    push(/^\|\s*:?-{2,}.*$/gm);
    push(/`[^`\n]*`/g);
    push(/\[[^\]\n]*\]\([^)\n]*\)/g);
    push(/\bhttps?:\/\/[^\s)]+/g);
    push(/\b(?:mailto|tel):[^\s)]+/g);
    return ranges;
  }
  const overlaps = (ranges, s, e) => ranges.some(([a, b]) => s < b && e > a);

  function autoLink(body, articles, selfId) {
    const text = String(body || '');
    const prot = protectedRanges(text);
    const already = new Set();
    text.replace(/\]\(#\/artikkel\/([A-Za-z0-9-]+)\)/g, (m, id) => { already.add(id); return m; });

    // finn beste treff per artikkel (tidligste forekomst)
    const cands = [];
    for (const a of articles) {
      if (!a || a.id === selfId || already.has(a.id)) continue;
      let best = null;
      for (const term of termsFor(a)) {
        const suffix = term.length >= 4 ? SUFFIX : '';
        const re = new RegExp('(^|[^' + LETTER + '])(' + escRe(term) + suffix + ')(?![' + LETTER + '])', 'giu');
        let m;
        while ((m = re.exec(text))) {
          const s = m.index + m[1].length;
          const e = s + m[2].length;
          if (!overlaps(prot, s, e)) {
            if (!best || s < best.s || (s === best.s && e > best.e)) best = { s, e, id: a.id };
            break;
          }
          re.lastIndex = m.index + 1;
        }
      }
      if (best) cands.push(best);
    }

    // løs overlapp: lengst treff vinner
    cands.sort((x, y) => (y.e - y.s) - (x.e - x.s) || x.s - y.s);
    const chosen = [];
    for (const c of cands) if (!chosen.some((k) => c.s < k.e && c.e > k.s)) chosen.push(c);
    chosen.sort((x, y) => x.s - y.s);

    let out = text;
    for (const c of [...chosen].reverse()) {
      const shown = text.slice(c.s, c.e).replace(/[[\]]/g, '');
      out = out.slice(0, c.s) + '[' + shown + '](#/artikkel/' + c.id + ')' + out.slice(c.e);
    }
    return { text: out, count: chosen.length, links: chosen.map((c) => ({ id: c.id, text: text.slice(c.s, c.e) })) };
  }

  g.HBLink = { autoLink: autoLink };
})(window);
