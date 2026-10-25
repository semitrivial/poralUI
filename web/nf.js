// nf.js -- Cantor normal form of the ordinal a pattern denotes.
//
// Uses only the library's own arithmetic, so it is exact:
//   * a decomposable point is the sum of its summands (indecomposables,
//     listed in non-increasing order by the pattern itself);
//   * an indecomposable x > 1 is ω^log(x), where log is the library's
//     base-ω logarithm;
//   * x = log(x) exactly when x is an epsilon number, where CNF stops.
//
// Below ε₀ this yields the complete Cantor normal form. Above ε₀, epsilon
// numbers remain as atoms; they are named when they match a known pattern
// (ε₀, Γ₀, or a user-defined name) and shown as ε⟨#id⟩ otherwise.
import { decodePattern, patternId } from './engine.js';

// Re-point an encoded pattern at another node.
const withPoint = (enc, i) => 'P' + i + enc.slice(enc.indexOf(';'));

// Tree: {k:'zero'} | {k:'sum', terms:[{exp:Tree|null, coef:n}]} | {k:'eps', name, id}
export function normalForm(engine, enc, knownNames = {}) {
  const memo = new Map();
  const cmp = (a, b) => engine.compare(a, b);
  const one = engine.constant('1');
  const known = Object.entries(knownNames);

  function epsName(p) {
    for (const [name, q] of known) if (cmp(p, q) === 0) return name;
    return null;
  }

  // Returns {exp} for an indecomposable p: exp=null means ω^0 = 1.
  function indec(p) {
    if (cmp(p, one) === 0) return { exp: null };
    const L = engine.log(p);
    if (cmp(L, p) === 0) return { eps: { k: 'eps', name: epsName(p), id: patternId(engine.simplify(p)) } };
    return { exp: nf(L) };
  }

  function nf(enc) {
    const key = engine.simplify(enc);
    if (memo.has(key)) return memo.get(key);
    const pat = decodePattern(key);
    const pt = pat.nodes[pat.point];
    let out;
    if (pat.point === 0) out = { k: 'zero' };
    else {
      const parts = (pt.dec ?? [pat.point]).map(i => indec(withPoint(key, i)));
      if (parts.length === 1 && parts[0].eps) out = parts[0].eps;
      else {
        const terms = [];
        for (const part of parts) {
          const exp = part.eps ?? part.exp;     // an epsilon ε is the term ω^ε
          const last = terms[terms.length - 1];
          if (last && sameTree(last.exp, exp)) last.coef++;
          else terms.push({ exp, coef: 1, eps: !!part.eps });
        }
        out = { k: 'sum', terms };
      }
    }
    memo.set(key, out);
    return out;
  }

  return nf(enc);
}

function sameTree(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// ---- formatting ----
const atomic = t => t.k === 'zero' || t.k === 'eps' ||
  (t.k === 'sum' && t.terms.length === 1 && (t.terms[0].exp === null || t.terms[0].coef === 1));

function epsText(t) { return t.name ?? `ε⟨#${t.id}⟩`; }

export function nfText(t) {
  if (t.k === 'zero') return '0';
  if (t.k === 'eps') return epsText(t);
  return t.terms.map(({ exp, coef, eps }) => {
    let base;
    if (exp === null) return String(coef);
    if (eps) base = epsText(exp);
    else if (exp.k === 'sum' && exp.terms.length === 1 && exp.terms[0].exp === null && exp.terms[0].coef === 1) base = 'ω';
    else base = 'ω^' + (atomic(exp) ? nfText(exp) : `(${nfText(exp)})`);
    return coef > 1 ? `${base}·${coef}` : base;
  }).join(' + ');
}

const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function epsHtml(t) {
  return t.name ? `<span class="eps">${esc(t.name)}</span>`
    : `<span class="eps anon" title="An epsilon number with no known name; Cantor normal form stops here.">ε<sub>#${t.id}</sub></span>`;
}

export function nfHtml(t) {
  if (t.k === 'zero') return '0';
  if (t.k === 'eps') return epsHtml(t);
  return t.terms.map(({ exp, coef, eps }) => {
    if (exp === null) return String(coef);
    let base;
    if (eps) base = epsHtml(exp);
    else if (exp.k === 'sum' && exp.terms.length === 1 && exp.terms[0].exp === null && exp.terms[0].coef === 1) base = 'ω';
    else base = `ω<sup>${nfHtml(exp)}</sup>`;
    return coef > 1 ? `${base}·${coef}` : base;
  }).join(' + ');
}
