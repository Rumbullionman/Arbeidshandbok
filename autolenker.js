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


  /* ---------- sammenligning med eksisterende artikler ---------- */
  const STOP = new Set(('og,i,jeg,det,at,en,et,den,til,er,som,på,de,med,han,av,ikke,ikkje,der,så,var,meg,seg,men,ett,har,om,vi,min,mitt,ha,hade,hvor,eller,hva,skal,selv,sjøl,her,alle,vil,bli,ble,blei,blitt,kunne,inn,når,være,kom,noen,noe,ville,dere,som,deres,kan,mer,ut,også,du,din,ditt,dine,hvis,vår,våre,må,får,få,etter,fra,for,over,under,ved,hos,mot,uten,mellom,denne,dette,disse,andre,annen,annet,bare,igjen,gjør,gjøre,første,siden,slik,sin,sitt,sine,hvordan,hver,hvert,både,fordi,mens,siden,samt,eller,dem,oss,ham,henne,hennes,hans,deg,dine,være,vært').split(','));
  const STEMS = ['enes', 'ene', 'ers', 'er', 'en', 'et', 'es', 'e', 'a', 's'];
  function stem(w) {
    if (w.length > 5) for (const s of STEMS) if (w.endsWith(s) && w.length - s.length >= 4) return w.slice(0, -s.length);
    return w;
  }
  function tokens(text) {
    return String(text || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)).map(stem);
  }
  function plain(line) {
    return line.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*`]/g, '').replace(/^\s*(?:>\s*!?|[-*]|\d+[.)])\s+/, '').replace(/\|/g, '. ').replace(/​/g, '');
  }
  function sentences(body) {
    const out = [];
    for (const line of String(body || '').split('\n')) {
      if (!line.trim() || /^#{1,3}\s/.test(line) || /^!\[/.test(line) || /^\|\s*:?-{2,}/.test(line)) continue;
      for (const s of plain(line).split(/(?<=[.!?:])\s+/)) {
        const t = s.trim();
        const tk = tokens(t);
        if (tk.length >= 5) out.push({ text: t.length > 220 ? t.slice(0, 217) + '…' : t, set: new Set(tk) });
      }
    }
    return out;
  }
  function simScore(a, b) {
    let shared = 0;
    a.forEach((w) => { if (b.has(w)) shared++; });
    const union = a.size + b.size - shared;
    const jac = shared / union;
    const cont = shared / Math.min(a.size, b.size);
    const ok = shared >= 4 && (jac >= 0.5 || (cont >= 0.8 && shared >= 5));
    return { ok, score: Math.max(jac, cont * 0.9), shared };
  }

  // Sammenligner det som er skrevet med de andre artiklene.
  // matches: setninger som ligner på setninger i andre artikler. suggestions: artikler som handler om det samme.
  function analyze(body, title, articles, selfId, relatedIds) {
    const others = articles.filter((a) => a && a.id !== selfId);
    const mine = sentences(body);
    const matches = [];
    const bySentence = new Map();
    for (const a of others) {
      for (const o of sentences(a.body)) {
        for (const m of mine) {
          const r = simScore(m.set, o.set);
          if (!r.ok) continue;
          const prev = bySentence.get(m);
          if (!prev || r.score > prev.score) bySentence.set(m, { sentence: m.text, articleId: a.id, title: a.title, other: o.text, score: r.score });
        }
      }
    }
    bySentence.forEach((v) => matches.push(v));
    matches.sort((x, y) => y.score - x.score);

    // artikkelnivå: tf-idf-likhet
    const docOf = (a) => {
      const tf = new Map();
      const add = (txt, w) => tokens(txt).forEach((t) => tf.set(t, (tf.get(t) || 0) + w));
      add(a.title, 3); add((a.tags || []).join(' '), 3); add(a.summary, 2); add(plain(a.body || '').replace(/^#+\s*/gm, ''), 1);
      return tf;
    };
    const mineTf = docOf({ title: title || '', body: body || '', tags: [], summary: '' });
    const docs = others.map((a) => ({ a, tf: docOf(a) }));
    const df = new Map();
    [mineTf, ...docs.map((d) => d.tf)].forEach((tf) => tf.forEach((_, t) => df.set(t, (df.get(t) || 0) + 1)));
    const N = docs.length + 1;
    const idf = (t) => Math.log(1 + N / (df.get(t) || 1));
    const vec = (tf) => { const v = new Map(); let n = 0; tf.forEach((c, t) => { const x = (1 + Math.log(c)) * idf(t); v.set(t, x); n += x * x; }); return { v, n: Math.sqrt(n) || 1 }; };
    const me = vec(mineTf);
    const skip = new Set(relatedIds || []);
    const sugg = [];
    for (const d of docs) {
      if (skip.has(d.a.id)) continue;
      const o = vec(d.tf);
      let dot = 0;
      const common = [];
      me.v.forEach((x, t) => { const y = o.v.get(t); if (y) { dot += x * y; common.push([t, x * y]); } });
      const cos = dot / (me.n * o.n);
      const hits = matches.filter((m) => m.articleId === d.a.id).length;
      const score = cos + Math.min(hits, 3) * 0.1;
      if (cos >= 0.12 || hits) {
        common.sort((x, y) => y[1] - x[1]);
        sugg.push({ id: d.a.id, title: d.a.title, score, hits, terms: common.slice(0, 4).map((c) => c[0]) });
      }
    }
    sugg.sort((x, y) => y.score - x.score);
    return { matches: matches.slice(0, 10), suggestions: sugg.slice(0, 6) };
  }

  g.HBLink = { autoLink: autoLink, analyze: analyze };
})(window);
