// lang.js -- the calculator's little expression language.
//
//   expr    := cmp | name '=' expr
//   cmp     := sum (('<' | '>' | '<=' | '>=' | '==') sum)?
//   sum     := prod ('+' prod)*
//   prod    := power (('*' | '×') power)*
//   power   := atom ('^' power)?          ω^x is exponentiation, x^n repeated product
//   atom    := number | name | #id | $n | Ans | [pattern-literal]
//            | func '(' expr (',' expr)* ')' | '(' expr ')'
//   func    := log | exp | simp | amal

const OPS = ['<=', '>=', '==', '<', '>', '+', '*', '×', '·', '^', '(', ')', ',', '='];

export function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c)) {
      let j = i; while (j < src.length && /[0-9]/.test(src[j])) j++;
      toks.push({ t: 'num', v: parseInt(src.slice(i, j), 10) }); i = j; continue;
    }
    if (c === '[') {
      const j = src.indexOf(']', i);
      if (j < 0) throw new Error('Unclosed pattern literal [...]');
      toks.push({ t: 'lit', v: src.slice(i + 1, j).trim() }); i = j + 1; continue;
    }
    if (c === '#' || c === '$') {
      let j = i + 1; while (j < src.length && /[0-9a-z]/i.test(src[j])) j++;
      toks.push({ t: c === '#' ? 'id' : 'hist', v: src.slice(i + 1, j) }); i = j; continue;
    }
    if (/[A-Za-z_\u0370-\u03ff\u2080-\u2089]/.test(c)) {
      let j = i; while (j < src.length && /[A-Za-z0-9_\u0370-\u03ff\u2080-\u2089']/.test(src[j])) j++;
      toks.push({ t: 'name', v: src.slice(i, j) }); i = j; continue;
    }
    const op = OPS.find(o => src.startsWith(o, i));
    if (!op) throw new Error(`Unexpected character '${c}'`);
    toks.push({ t: 'op', v: op === '×' || op === '·' ? '*' : op }); i += op.length;
  }
  return toks;
}

export function parse(src) {
  const toks = tokenize(src);
  let k = 0;
  const peek = () => toks[k];
  const isOp = v => peek() && peek().t === 'op' && peek().v === v;
  const expect = v => { if (!isOp(v)) throw new Error(`Expected '${v}'`); k++; };

  function expr() {
    if (peek() && peek().t === 'name' && toks[k + 1] && toks[k + 1].t === 'op' && toks[k + 1].v === '=') {
      const name = peek().v; k += 2;
      return { k: 'assign', name, e: expr() };
    }
    return cmp();
  }
  function cmp() {
    const a = sum();
    if (peek() && peek().t === 'op' && ['<', '>', '<=', '>=', '=='].includes(peek().v)) {
      const op = toks[k++].v;
      return { k: 'cmp', op, a, b: sum() };
    }
    return a;
  }
  function sum() {
    let a = prod();
    while (isOp('+')) { k++; a = { k: 'add', a, b: prod() }; }
    return a;
  }
  function prod() {
    let a = power();
    while (isOp('*')) { k++; a = { k: 'mul', a, b: power() }; }
    return a;
  }
  function power() {
    const a = atom();
    if (isOp('^')) { k++; return { k: 'pow', a, b: power() }; }
    return a;
  }
  function atom() {
    const t = toks[k++];
    if (!t) throw new Error('Unexpected end of expression');
    if (t.t === 'num') return { k: 'num', v: t.v };
    if (t.t === 'lit') return { k: 'lit', v: t.v };
    if (t.t === 'id') return { k: 'id', v: t.v };
    if (t.t === 'hist') return { k: 'hist', v: parseInt(t.v, 10) };
    if (t.t === 'op' && t.v === '(') { const e = expr(); expect(')'); return e; }
    if (t.t === 'name') {
      if (isOp('(')) {
        k++;
        const args = [expr()];
        while (isOp(',')) { k++; args.push(expr()); }
        expect(')');
        return { k: 'call', f: t.v.toLowerCase(), args };
      }
      return { k: 'name', v: t.v };
    }
    throw new Error(`Unexpected '${t.v}'`);
  }

  const e = expr();
  if (k < toks.length) throw new Error(`Unexpected '${toks[k].v}'`);
  return e;
}

// Canonical spellings for built-in names.
export const ALIASES = {
  w: 'ω', omega: 'ω', 'ω': 'ω',
  e0: 'ε₀', eps0: 'ε₀', epsilon0: 'ε₀', 'ε0': 'ε₀', 'ε₀': 'ε₀',
  g0: 'Γ₀', G0: 'Γ₀', gamma0: 'Γ₀', Gamma0: 'Γ₀', 'Γ0': 'Γ₀', 'Γ₀': 'Γ₀',
};

// Pretty-print an AST in conventional ordinal notation.
export function pretty(e, ctx = {}) {
  const P = (x, lvl) => {
    const s = pretty(x, ctx);
    return prec(x) < lvl ? `(${s})` : s;
  };
  switch (e.k) {
    case 'num': return String(e.v);
    case 'lit': return `[${e.v}]`;
    case 'id': return ctx.idLabel?.(e.v) ?? `#${e.v}`;
    case 'hist': return ctx.histLabel?.(e.v) ?? `$${e.v}`;
    case 'name': return ALIASES[e.v] ?? e.v;
    case 'assign': return pretty(e.e, ctx);
    case 'cmp': return `${pretty(e.a, ctx)} ${e.op} ${pretty(e.b, ctx)}`;
    case 'add': return `${P(e.a, 1)} + ${P(e.b, 2)}`;
    case 'mul': return `${P(e.a, 2)}·${P(e.b, 3)}`;
    case 'pow': return `${P(e.a, 4)}^${P(e.b, 4)}`;
    case 'call':
      if (e.f === 'exp') return `ω^${P(e.args[0], 4)}`;
      return `${e.f}(${e.args.map(a => pretty(a, ctx)).join(', ')})`;
  }
  return '?';
}
function prec(e) {
  if (e.k === 'add') return 1;
  if (e.k === 'mul') return 2;
  if (e.k === 'pow' || (e.k === 'call' && e.f === 'exp')) return 3;
  if (e.k === 'cmp' || e.k === 'assign') return 0;
  return 5;
}

// Evaluate an AST. env: { engine, lookupName(name), lookupId(id), lookupHist(n), simplify }
// Returns { type: 'pattern', p } or { type: 'bool', value, text }.
export function evaluate(e, env) {
  const E = env.engine;
  const S = p => (env.simplify ? E.simplify(p) : p);
  const pat = x => {
    const r = evaluate(x, env);
    if (r.type !== 'pattern') throw new Error('A comparison cannot be used as an ordinal.');
    return r.p;
  };
  const natural = n => {
    if (n > 200) throw new Error('Natural numbers above 200 are not supported.');
    let p = E.constant('0');
    const one = E.constant('1');
    for (let i = 0; i < n; i++) p = E.add(p, one);
    return p;
  };
  const ret = p => ({ type: 'pattern', p });

  switch (e.k) {
    case 'num': return ret(natural(e.v));
    case 'lit': return ret(E.normalize(e.v));
    case 'id': return ret(env.lookupId(e.v));
    case 'hist': return ret(env.lookupHist(e.v));
    case 'name': return ret(env.lookupName(ALIASES[e.v] ?? e.v));
    case 'assign': return evaluate(e.e, env);
    case 'add': return ret(S(E.add(pat(e.a), pat(e.b))));
    case 'mul': return ret(S(E.mul(pat(e.a), pat(e.b))));
    case 'pow': {
      if (e.a.k === 'name' && ALIASES[e.a.v] === 'ω') return ret(S(E.exp(pat(e.b))));
      if (e.b.k !== 'num') throw new Error('Only ω^x or x^n (n a natural number) are supported.');
      if (e.b.v === 0) return ret(natural(1));
      const base = pat(e.a);
      let p = base;
      for (let i = 1; i < e.b.v; i++) p = S(E.mul(p, base));
      return ret(p);
    }
    case 'cmp': {
      const c = E.compare(pat(e.a), pat(e.b));
      const value = { '<': c < 0, '>': c > 0, '<=': c <= 0, '>=': c >= 0, '==': c === 0 }[e.op];
      const rel = c < 0 ? '<' : c > 0 ? '>' : '=';
      return { type: 'bool', value, rel };
    }
    case 'call': {
      const n = e.args.length;
      const need = m => { if (n !== m) throw new Error(`${e.f} takes ${m} argument(s)`); };
      switch (e.f) {
        case 'exp': need(1); return ret(S(E.exp(pat(e.args[0]))));
        case 'log': need(1); return ret(S(E.log(pat(e.args[0]))));
        case 'simp': need(1); return ret(E.simplify(pat(e.args[0])));
        case 'amal': {
          need(2);
          const r = E.amalgamate(pat(e.args[0]), pat(e.args[1]));
          return { type: 'pattern', p: r.pattern, marks: [r.p1, r.p2] };
        }
      }
      throw new Error(`Unknown function ${e.f}`);
    }
  }
  throw new Error('Cannot evaluate');
}
