// render.js -- draw a pattern of resemblance as SVG.
//
// Nodes sit on a horizontal line in order. Each node x with x <=_1 y (y its
// largest such node) gets an arc from x to y above the line. Indecomposable
// nodes are solid dots; decomposable nodes (sums) are small hollow dots whose
// summands are linked by faint arcs below the line when hovered.
import { decodePattern } from './engine.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};

// Name indecomposable nodes a, b, c, ... (skipping zero); sums are written out.
export function nodeLabels(pat) {
  const letters = [];
  let k = 0;
  const name = i => {
    let s = '', n = k++;
    do { s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
    return s;
  };
  for (const nd of pat.nodes) letters[nd.i] = nd.i === 0 ? '0' : nd.dec ? null : name(nd.i);
  return pat.nodes.map(nd => nd.dec ? nd.dec.map(d => letters[d]).join('+') : letters[nd.i]);
}

export function renderPattern(enc, opts = {}) {
  const pat = decodePattern(enc);
  const n = pat.nodes.length;
  const thumb = !!opts.thumb;
  const step = thumb ? Math.max(6, Math.min(26, 220 / Math.max(1, n - 1)))
                     : Math.max(14, Math.min(70, 860 / Math.max(1, n - 1)));
  const pad = thumb ? 10 : 36;
  const width = pad * 2 + step * (n - 1);
  const maxSpan = Math.max(1, ...pat.nodes.map(d => d.less1 - d.i));
  const archH = thumb ? 46 : Math.min(260, Math.max(90, step * maxSpan * 0.5));
  const baseY = archH + (thumb ? 8 : 24);
  const height = baseY + (thumb ? 10 : 70);
  const X = i => pad + i * step;

  const svg = el('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'pattern' + (thumb ? ' thumb' : ''),
    width: thumb ? Math.min(width, 260) : width,
    height: thumb ? Math.min(height, 260 * height / width) : height,
  });
  const defs = el('defs', {}, svg);
  const grad = el('linearGradient', { id: 'arcgrad', x1: 0, x2: 1, y1: 0, y2: 0 }, defs);
  el('stop', { offset: '0%', 'stop-color': '#7dd3fc' }, grad);
  el('stop', { offset: '100%', 'stop-color': '#f0abfc' }, grad);
  const glow = el('filter', { id: 'glow', x: '-20%', y: '-20%', width: '140%', height: '140%' }, defs);
  el('feGaussianBlur', { stdDeviation: thumb ? 0.8 : 2.2, result: 'b' }, glow);
  const merge = el('feMerge', {}, glow);
  el('feMergeNode', { in: 'b' }, merge);
  el('feMergeNode', { in: 'SourceGraphic' }, merge);

  // Baseline
  el('line', { x1: pad - 14, x2: width - pad + 14, y1: baseY, y2: baseY, class: 'baseline' }, svg);

  // <=_1 arcs
  const arcs = el('g', { class: 'arcs', filter: 'url(#glow)' }, svg);
  const arcEls = [];
  pat.nodes.forEach((nd, idx) => {
    if (nd.less1 === nd.i) return;
    const x1 = X(nd.i), x2 = X(nd.less1);
    const rx = (x2 - x1) / 2;
    const ry = Math.min(archH - 6, rx * (thumb ? 0.9 : 0.75));
    const p = el('path', {
      d: `M ${x1} ${baseY} A ${rx} ${ry} 0 0 1 ${x2} ${baseY}`,
      class: 'arc', style: `animation-delay:${Math.min(idx * 40, 900)}ms`,
    }, arcs);
    p.dataset.from = nd.i; p.dataset.to = nd.less1;
    arcEls.push(p);
  });

  // Summand links (below line), shown on hover
  const sums = el('g', { class: 'sums' }, svg);

  const labels = nodeLabels(pat);
  const marks = new Set(opts.marks || []);
  const nodeG = el('g', { class: 'nodes' }, svg);
  pat.nodes.forEach(nd => {
    const g = el('g', { class: 'node' + (nd.dec ? ' dec' : '') + (nd.i === pat.point ? ' point' : '') + (marks.has(nd.i) ? ' mark' : '') }, nodeG);
    const x = X(nd.i);
    if (nd.i === pat.point) el('circle', { cx: x, cy: baseY, r: thumb ? 5 : 11, class: 'halo' }, g);
    if (marks.has(nd.i)) el('circle', { cx: x, cy: baseY, r: thumb ? 5 : 11, class: 'markring' }, g);
    el('circle', { cx: x, cy: baseY, r: nd.dec ? (thumb ? 1.8 : 3.6) : (thumb ? 2.6 : 5.2), class: 'dot' }, g);
    if (!thumb) {
      const showLabel = !nd.dec || step >= 34;
      if (showLabel) {
        const t = el('text', { x, y: baseY + 24, class: 'label' + (nd.dec ? ' sum' : '') }, g);
        t.textContent = labels[nd.i];
      }
      el('circle', { cx: x, cy: baseY, r: Math.max(8, step / 2), class: 'hit' }, g);
      const title = el('title', {}, g);
      const rel = nd.less1 !== nd.i ? `\n${labels[nd.i]} ≤₁ ${labels[nd.less1]}` : '';
      title.textContent = `node ${nd.i}: ${labels[nd.i]}${nd.i === pat.point ? '  (designated point)' : ''}${rel}` +
        (opts.nodeNotes ? `\n= ${opts.nodeNotes[nd.i]}` : '');
      g.addEventListener('mouseenter', () => {
        svg.classList.add('hovering');
        arcEls.forEach(a => { if (+a.dataset.from === nd.i || +a.dataset.to === nd.i) a.classList.add('hot'); });
        if (nd.dec) {
          nd.dec.forEach((d, j) => {
            const xd = X(d), r = (x - xd) / 2;
            el('path', { d: `M ${xd} ${baseY} A ${r} ${Math.min(50, r * 0.5)} 0 0 0 ${x} ${baseY}`, class: 'sumlink', style: `opacity:${1 - j * 0.12}` }, sums);
          });
        }
      });
      g.addEventListener('mouseleave', () => {
        svg.classList.remove('hovering');
        arcEls.forEach(a => a.classList.remove('hot'));
        sums.replaceChildren();
      });
    }
  });
  return svg;
}
