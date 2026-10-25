import { Engine, decodePattern } from '../engine.js';
import { realizePattern, verify, format, cmp, T1 } from '../theta.js';
const E = await Engine.create();
let seed = +process.argv[2] || 1; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
const atoms = [E.constant('1'), E.constant('w'), 'P1;0;2;2=1.1', 'P1;0;3;3;3=2.1'];
function gen(d) {
  if (d === 0 || rnd(3) === 0) return pool[rnd(pool.length)];
  const k = rnd(5);
  try {
    if (k === 0) return E.simplify(E.add(gen(d-1), gen(d-1)));
    if (k === 1) return E.simplify(E.mul(gen(d-1), gen(d-1)));
    if (k === 2) return E.simplify(E.exp(gen(d-1)));
    // amalgamation: point at either operand's embedding
    const r = E.amalgamate(gen(d-1), gen(d-1));
    return E.simplify('P' + r[rnd(2) ? 'p1' : 'p2'] + r.pattern.slice(r.pattern.indexOf(';')));
  } catch { return atoms[rnd(atoms.length)]; }
}
const N = +process.argv[3] || 300; const pool=[...atoms]; let ok = 0, fail = 0, err = 0, maxNodes = 0; const seen = new Set();
const pts = [];
for (let i = 0; i < N; i++) {
  const big = gen(3); const bp = decodePattern(big);
  const cand = bp.nodes.map((_, j) => { try { return E.simplify('P'+j+big.slice(big.indexOf(';'))); } catch { return null; } }).filter(Boolean);
  for (const p of cand) { if (seen.has(p)) continue; seen.add(p); if (pool.length < 400) pool.push(p);
  if (process.env.TRACE) console.log("try", p); const pat = decodePattern(p); maxNodes = Math.max(maxNodes, pat.nodes.length);
  try {
    const t0=Date.now(); const r = realizePattern(pat); const t1=Date.now(); const e = verify(r); const t2=Date.now(); if (t2-t0>2000) console.log("SLOW", pat.nodes.length, t1-t0, t2-t1, p);
    if (e.length) { fail++; if (fail <= 5) console.log('FAIL', p, e.slice(0,2)); } else { ok++; pts.push([p, r.vals[r.point]]); }
  } catch (x) { err++; if (err <= 5) console.log('ERR', p, x.message); }
  }
}
// cross-check order between distinct patterns against the library's comparison
let ordBad = 0, pairs = 0;
for (let i = 0; i < pts.length && pairs < 3000; i++) for (let j = i + 1; j < pts.length && pairs < 3000; j++, pairs++) {
  const a = E.compare(pts[i][0], pts[j][0]), b = cmp(T1, pts[i][1], pts[j][1]);
  if (a !== b) { ordBad++; if (ordBad <= 3) console.log('ORDER', pts[i][0], pts[j][0], a, b, format(pts[i][1]), format(pts[j][1])); }
}
console.log({ distinct: seen.size, ok, fail, err, maxNodes, pairs, ordBad });
