// theta.js -- Wilken's ϑ-notation (KPℓ₀ normal form) for patterns of resemblance.
//
// References (files in the repo root):
//   [OA]  G. Wilken, Ordinal arithmetic based on Skolem hulling, APAL 145 (2007)   wilken2007_2.txt
//   [S1]  G. Wilken, Σ1-elementarity and Skolem hull operators, APAL 145 (2007)    wilken2007_3.txt
//   [AO]  G. Wilken, Assignment of ordinals to patterns of resemblance, JSL 72 (2007) wilken2007.txt
//
// Ordinals are terms of a relativized system Tτ ([OA] §3): parameters < τ, +, and
// ϑ_k (k ≥ 0, ϑ_0 = ϑ^τ). A term is an array of additive principal components in
// non-increasing order (additive normal form); a component is either
//   {k, a}  -- ϑ_k(a), with a again a term of the same system, or
//   {p}     -- a parameter < τ, where p is a one-component term of the parent system.
// A system is {parent} (parent === null means τ = 1, whose only parameter is 0).
//
// patternToTheta() implements the isominimal realization algorithm of [AO] Thm 3.2.
// lh() implements the ≤1-reach recursion of [S1] Def 4.1; verify() uses it to check
// that the computed ordinals reproduce the pattern's ≤1 relation exactly.

export const T1 = { parent: null };
const sys = parent => ({ parent });

const th = (k, a) => ({ k, a });
const isP = c => c.p !== undefined;

// ---------- comparison ([OA] Lemma 3.30) ----------
export function cmp(S, x, y) {
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const c = cmpC(S, x[i], y[i]);
    if (c) return c;
  }
  return Math.sign(x.length - y.length);
}

function cmpC(S, c, d) {
  if (isP(c) && isP(d)) return cmp(S.parent, c.p, d.p);
  if (isP(c)) return -1;
  if (isP(d)) return 1;
  if (c.k !== d.k) return Math.sign(c.k - d.k);
  const ag = cmp(S, c.a, d.a);
  if (ag === 0) return 0;
  // ϑm(α) < ϑm(γ)  ⇔  (α < γ ∧ α*m < ϑm(γ)) ∨ ϑm(α) ≤ γ*m
  const m = c.k;
  if (ag < 0 && cmp(S, star(S, c.a, m), [d]) < 0) return -1;
  if (cmp(S, [c], star(S, d.a, m)) <= 0) return -1;
  return 1;
}

const eq = (S, x, y) => cmp(S, x, y) === 0;
const lt = (S, x, y) => cmp(S, x, y) < 0;

// α*m: the largest ϑm-subterm not in the scope of a ϑk with k < m ([OA] Def 3.28).
export function star(S, x, m) {
  let best = null;
  const visit = t => {
    for (const c of t) {
      if (isP(c) || c.k < m) continue;
      if (c.k === m && (!best || cmpC(S, c, best) > 0)) best = c;
      visit(c.a);
    }
  };
  visit(x);
  return best ? [best] : [];
}

// ---------- arithmetic ----------
export function add(S, x, y) {
  if (!y.length) return x;
  const y0 = y[0];
  const keep = x.filter(c => cmpC(S, c, y0) >= 0);
  return keep.concat(y);
}
const sum = (S, ...xs) => xs.reduce((s, x) => add(S, s, x), []);

// -a + b  (requires a ≤ b)
function leftSub(S, a, b) {
  let i = 0;
  while (i < a.length && i < b.length && cmpC(S, a[i], b[i]) === 0) i++;
  return b.slice(i);
}

const lift = (S, x) => x.map(c => ({ p: [c] }));          // parent term < τ  →  S term
const unlift = x => x.map(c => c.p[0]);                     // S term < τ  →  parent term
const tauT = () => [th(0, [])];                             // τ = ϑ0(0)
const one = S => (S.parent ? lift(S, one(S.parent)) : [th(0, [])]);
const Omega = k => [th(k, [])];

// Split the argument of ϑ0 into Δ (multiple of Ω1) and η (< Ω1)  ([OA] Conv. 4.1)
function split(a) {
  let i = 0;
  while (i < a.length && !isP(a[i]) && a[i].k >= 1) i++;
  return [a.slice(0, i), a.slice(i)];
}
const mk = arg => [th(0, arg)];

const isEpsComp = (S, c) =>
  isP(c) ? isEpsComp(S.parent, c.p[0]) : c.k === 0 && (split(c.a)[0].length > 0 || (c.a.length === 0 && S.parent !== null));

// ζ is of the form ε + n with ε = ϑ(Ξ+ν), Ξ > 0 and n < ω.  Returns n or -1.
function epsPlusFinite(S, z) {
  if (!z.length || isP(z[0]) || z[0].k !== 0 || !split(z[0].a)[0].length) return -1;
  const o = one(S)[0];
  for (let i = 1; i < z.length; i++) if (cmpC(S, z[i], o) !== 0) return -1;
  return z.length - 1;
}

// logend ([OA] Lemma 4.10); for additive principal x this is log_ω(x).
function logend(S, x) {
  if (!x.length) return [];
  const c = x[x.length - 1];
  if (isP(c)) return lift(S, logend(S.parent, c.p));
  if (c.k !== 0) throw new Error('logend of a term ≥ Ω1');
  const [D, eta] = split(c.a);
  if (D.length) return [c];
  if (epsPlusFinite(S, eta) >= 0) return add(S, eta, one(S));
  return S.parent ? add(S, tauT(), eta) : eta;
}

// ω^ζ for ζ < Ω1 (proof of [OA] Lemma 5.8).
function omegaExp(S, z) {
  const belowTau = z.every(isP);
  if (belowTau) return S.parent ? lift(S, omegaExp(S.parent, unlift(z))) : one(S);
  if (eq(S, z, tauT())) return S.parent ? tauT() : mk(one(S));
  const n = epsPlusFinite(S, z);
  if (n === 0) return z;
  if (n > 0) return mk(z.slice(0, -1));
  // remaining case: ζ = τ + ζ0, ω^ζ = ϑ(ζ0). For τ = 1 this is ϑ(ζ) (ϑ(1+α) = ω̄_{1+α}).
  return S.parent ? mk(leftSub(S, tauT(), z)) : mk(z);
}

const timesOmega = (S, x) =>
  isP(x[0]) ? lift(S, timesOmega(S.parent, x[0].p)) : omegaExp(S, add(S, logend(S, [x[0]]), one(S)));

// Lemma 4.4 of [OA]: ζ = sup_{σ<ζ} ϑ(Δ+σ)
function isF(S, z, D) {
  if (z.length !== 1 || isP(z[0]) || z[0].k !== 0) return false;
  return cmp(S, split(z[0].a)[0], D) > 0 && cmp(S, z, star(S, D, 0)) > 0;
}

// ζ^τ_α ([OA] Def 4.11)
function zeta(S, alpha) {
  const [D, eta] = split(alpha[0].a);
  if (!eta.length || isF(S, eta, D)) return [];
  return logend(S, eta);
}

// [OA] Lemma 5.8: least β = ϑ(Δ+η) > α with ζ_β = ζ  (α a ϑ0-term, Ω1 | Δ < Ω2, ζ < Ω1)
export function lemma58(S, alpha, D, z) {
  const F = z.length > 0 && isF(S, z, D);
  const tD = mk(D);
  const tail = (base, cmpWith) => {
    if (!z.length) return null;
    if (!F || (cmpWith && cmp(S, cmpWith, z) >= 0)) return mk(sum(S, D, base, omegaExp(S, z)));
    return mk(sum(S, D, z, z));
  };
  const c = cmp(S, alpha, tD);
  if (c <= 0) {
    if (!z.length) return c < 0 ? tD : mk(add(S, D, one(S)));
    return F ? mk(sum(S, D, z, z)) : mk(add(S, D, omegaExp(S, z)));
  }
  const [G, rho] = split(alpha[0].a);
  const g = cmp(S, G, D);
  if (g === 0) return z.length ? tail(rho, rho) : mk(sum(S, D, rho, one(S)));
  if (g > 0) return z.length ? tail(alpha, alpha) : mk(add(S, D, alpha));
  const s = star(S, alpha[0].a, 0);
  if (eq(S, s, tD)) {
    if (!z.length) return mk(add(S, D, one(S)));
    return F ? mk(sum(S, D, z, z)) : mk(add(S, D, omegaExp(S, z)));
  }
  return lemma58(S, s, D, z); // Subcase 2.4
}

// ---------- localization, ι, translation, λ ----------
function localization(S, alpha) {
  const P = [];
  const visit = t => { for (const c of t) if (!isP(c)) { if (c.k === 0) P.push(c); visit(c.a); } };
  visit(alpha);
  const seq = [tauT()];
  while (lt(S, seq[seq.length - 1], alpha)) {
    const cur = seq[seq.length - 1];
    let best = null;
    for (const c of P) if (cmp(S, [c], cur) > 0 && (!best || cmp(S, c.a, best.a) > 0)) best = c;
    seq.push([best]);
  }
  return seq;
}

// ι_{τ,α}: Tτ↾α → Tα  ([OA] Def 7.1); Sa is the system over α.
function iota(S, Sa, alpha, x) {
  return x.map(c => (cmp(S, [c], alpha) < 0 ? { p: [c] } : th(c.k - 1, iota(S, Sa, alpha, c.a))));
}
function iotaInv(y) {
  return y.map(c => (isP(c) ? c.p[0] : th(c.k + 1, iotaInv(c.a))));
}

// t^α_τ: Tα → Tτ  and  t^τ_α: Tτ → Tα   ([OA] Def 6.2), α = ϑτ(Δ+η) with Δ > 0.
function tUp(S, Sa, alpha, y) {
  const [Da, ea] = split(alpha[0].a);
  const DaInA = tDown(S, Sa, alpha, Da);
  const tc = c => {
    if (isP(c)) return [c.p[0]];
    if (c.k > 0) return [th(c.k, tUp(S, Sa, alpha, c.a))];
    if (!c.a.length) return alpha;
    const v = cmpC(Sa, c, th(0, DaInA));
    if (v === 0) return mk(sum(S, Da, ea, one(S)));
    if (v > 0) throw new Error('translation out of range');
    const [G, rho] = split(c.a);
    const up = t => tUp(S, Sa, alpha, t);
    if (!G.length) return mk(add(S, alpha, up(leftSub(Sa, one(Sa), rho))));
    if (!star(Sa, G, 0).length) return mk(sum(S, up(G), alpha, up(rho)));
    return mk(add(S, up(G), up(rho)));
  };
  return y.reduce((s, c) => add(S, s, tc(c)), []);
}

function tDown(S, Sa, alpha, x) {
  const [Da, ea] = split(alpha[0].a);
  const aplus = mk(sum(S, Da, ea, one(S)));
  const tc = c => {
    if (cmp(S, [c], alpha) < 0) return [{ p: [c] }];
    if (c.k > 0) return [th(c.k, tDown(S, Sa, alpha, c.a))];
    if (eq(S, [c], alpha)) return tauT();
    const v = cmp(S, [c], aplus);
    if (v === 0) return mk(tDown(S, Sa, alpha, Da));
    if (v > 0) throw new Error('translation out of range');
    const [G, rho] = split(c.a);
    const dn = t => tDown(S, Sa, alpha, t);
    if (!G.length) return mk(add(Sa, one(Sa), dn(leftSub(S, alpha, rho))));
    if (cmp(S, star(S, G, 0), alpha) < 0) return mk(add(Sa, dn(G), dn(leftSub(S, alpha, rho))));
    return mk(add(Sa, dn(G), dn(rho)));
  };
  return x.reduce((s, c) => add(Sa, s, tc(c)), []);
}

// λ^τ_α ([OA] Def 7.5), returned as a term of Tτ.
function lambda(S, alpha) {
  const [D] = split(alpha[0].a);
  const z = zeta(S, alpha);
  if (!D.length) return z;
  const Sa = sys(S);
  const inA = add(Sa, iota(S, Sa, alpha, D), lift(Sa, z));
  return tUp(S, Sa, alpha, inA);
}

// lh^τ ([S1] Def 4.1): the ≤1-reach, for α < Ω1.
export function lh(S, alpha) {
  if (cmp(S, alpha, tauT()) <= 0) return S.parent ? [] : alpha;
  if (alpha.length > 1 || isP(alpha[0])) return alpha;
  const lam = lambda(S, alpha);
  const d = star(S, lam, 0);
  if (cmp(S, d, alpha) <= 0) return add(S, alpha, lam);
  const loc = localization(S, d);
  const start = loc.findIndex(x => eq(S, x, alpha));
  if (start < 0) throw new Error('lh: α not in the localization of δ');
  const dl = loc.slice(start);
  const m = dl.length - 1;
  let i = m;
  for (let j = 1; j < m; j++) if (cmp(S, lambda(S, dl[j]), d) >= 0) { i = j; break; }
  if (i < m) return add(S, lh(S, dl[i]), lam);
  return add(S, lh(S, d), leftSub(S, d, lam));
}

// ---------- [AO] Theorem 3.2: isominimal realization ----------
// nodes[i] = {less1, dec}; realize nodes t+1..last given o on 0..t (o[t] = τ).
function realize(S, nodes, last, t, o) {
  if (last <= t) return o.slice(0, last + 1);
  const reaches = (v, u) => v < u && nodes[v].less1 >= u;            // v <1 u
  const isRoot = (u, lo) => { for (let v = lo + 1; v < u; v++) if (reaches(v, u)) return false; return true; };
  let b = last;
  while (!isRoot(b, t)) b--;
  const a = b - 1;
  const oa = realize(S, nodes, a, t, o);
  const alpha = oa[a];
  const res = oa.slice();
  const dec = u => nodes[u].dec;
  const sumOf = (vals, ds) => ds.reduce((s, d) => add(S, s, vals[d]), []);

  if (b === last) {                                                   // Case 1
    res[b] = dec(b) ? sumOf(oa, dec(b)) : timesOmega(S, alpha);
    return res;
  }
  const imm = [];
  for (let u = b + 1; u <= last; u++) if (isRoot(u, b)) imm.push(u);
  const case3 = !dec(b) && imm.some(c => !dec(c) || dec(c)[1] === b);
  const aStar = star(S, alpha, 0);
  if (!case3) {                                                        // Case 2
    const z = sumOf(oa, dec(last).slice(1));
    res[b] = lemma58(S, aStar, [], z);
    for (let u = b + 1; u <= last; u++) res[u] = sumOf(res, dec(u));
    return res;
  }
  // Case 3: b is assigned an epsilon number.
  const e = lemma58(S, aStar, Omega(1), []);
  const Se = sys(S);
  const ob = [];
  for (let i = 0; i <= a; i++) ob[i] = lift(Se, oa[i]);
  ob[b] = tauT();
  const obp = realize(Se, nodes, last, b, ob);
  let lam = null;
  imm.forEach((c, i) => {
    const y = obp[c];
    if (i === 0) lam = dec(c) ? ob[dec(c)[1]] : y;
    else lam = dec(c) ? add(Se, lam, leftSub(Se, obp[c - 1], y)) : y;
  });
  const io = lam.filter(c => !isP(c)), zp = lam.filter(isP);
  const beta = lemma58(S, aStar, iotaInv(io), unlift(zp));
  const Sb = sys(S);                                                   // π⁻¹_{e,β} is the identity on terms
  for (let u = b; u <= last; u++) res[u] = tUp(S, Sb, beta, obp[u]);
  return res;
}

// Prepare a decoded pattern ({point, nodes:[{less1, dec}]}) and realize it in T^1.
export function realizePattern(pat) {
  let nodes = pat.nodes.map(n => ({ less1: n.less1, dec: n.dec }));
  let point = pat.point, inserted = false;
  if (nodes.length > 1 && nodes[1].less1 !== 1) {
    // [AO] after Thm 3.2: add a least indecomposable without ≤1-successors to serve as t.
    const sh = i => (i >= 1 ? i + 1 : i);
    nodes = [nodes[0], { less1: 1, dec: null },
      ...nodes.slice(1).map(n => ({ less1: sh(n.less1), dec: n.dec && n.dec.map(sh) }))];
    point = sh(point); inserted = true;
  }
  const vals = nodes.length === 1 ? [[]] : realize(T1, nodes, nodes.length - 1, 1, [[], tauT()]);
  return { nodes, vals, point, inserted };
}

// Check that the realization is an isomorphism onto its image (order, +, ≤1 via lh).
export function verify({ nodes, vals }) {
  const S = T1, errs = [];
  for (let i = 1; i < vals.length; i++) if (!lt(S, vals[i - 1], vals[i])) errs.push(`order fails at node ${i}`);
  nodes.forEach((n, i) => {
    if (n.dec && !eq(S, sum(S, ...n.dec.map(d => vals[d])), vals[i])) errs.push(`sum fails at node ${i}`);
  });
  const reach = vals.map(v => lh(S, v));
  for (let u = 0; u < vals.length; u++) for (let v = u + 1; v < vals.length; v++) {
    const pat = nodes[u].less1 >= v, ord = cmp(S, vals[v], reach[u]) <= 0;
    if (pat !== ord) errs.push(`≤1 mismatch between nodes ${u} and ${v} (pattern ${pat}, ordinals ${ord})`);
  }
  return errs;
}

// ---------- formatting (T^1 terms) ----------
const SUBS = '₀₁₂₃₄₅₆₇₈₉';
const sub = k => String(k).replace(/\d/g, d => SUBS[d]);

export function format(x, html = false) {
  if (!x.length) return '0';
  const parts = [];
  for (let i = 0; i < x.length;) {
    let j = i;
    while (j < x.length && cmpC(T1, x[i], x[j]) === 0) j++;
    const c = x[i], n = j - i;
    let s;
    if (c.k === 0 && !c.a.length) s = '1';
    else if (c.k === 0 && c.a.length === 1 && c.a[0].k === 0 && !c.a[0].a.length) s = 'ω';
    else if (c.k > 0 && !c.a.length) s = html ? `Ω<sub>${c.k}</sub>` : `Ω${sub(c.k)}`;
    else {
      const name = c.k === 0 ? 'ϑ' : html ? `ϑ<sub>${c.k}</sub>` : `ϑ${sub(c.k)}`;
      s = `${name}(${format(c.a, html)})`;
    }
    parts.push(s === '1' ? String(n) : n > 1 ? `${s}·${n}` : s);
    i = j;
  }
  return parts.join(' + ');
}
