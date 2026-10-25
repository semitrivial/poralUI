// engine.js -- wrapper around the PORAL wasm module.
// Patterns are passed around as compact strings ("P1;0;2;2=1.1"), so the
// module can be thrown away and re-created after a trap without losing data.
import createPoral from './poral.js';

export class Engine {
  static async create() {
    const e = new Engine();
    await e.reset();
    return e;
  }

  async reset() {
    this.mod = await createPoral();
    const w = (name, n) => this.mod.cwrap(name, 'string', Array(n).fill('string'));
    this._init = this.mod.cwrap('api_init', 'number', []);
    this._constant = w('api_constant', 1);
    this._binary = w('api_binary', 3);
    this._unary = w('api_unary', 2);
    this._normalize = w('api_normalize', 1);
    this._init();
  }

  _call(fn, ...args) {
    let out;
    try {
      out = this[fn](...args);
    } catch (err) {
      // The C library aborted (or trapped). Rebuild the module for next time.
      this.reset();
      throw new Error('The arithmetic engine crashed on this input (' + err.message + ').');
    }
    if (out.startsWith('ERR:')) throw new Error(out.slice(4));
    return out;
  }

  constant(name) { return this._call('_constant', name); }
  normalize(p) { return this._call('_normalize', p); }
  add(a, b) { return this._call('_binary', 'add', a, b); }
  mul(a, b) { return this._call('_binary', 'mul', a, b); }
  compare(a, b) { return parseInt(this._call('_binary', 'cmp', a, b), 10); }
  exp(a) { return this._call('_unary', 'exp', a); }
  log(a) { return this._call('_unary', 'log', a); }
  simplify(a) { return this._call('_unary', 'simp', a); }
  // Returns {pattern, p1, p2}: p1/p2 are where the operands' points embed.
  amalgamate(a, b) {
    const [pattern, i, j] = this._call('_binary', 'amal', a, b).split('|');
    return { pattern, p1: +i, p2: +j };
  }
}

// Parse an encoded pattern into a JS structure for drawing.
export function decodePattern(s) {
  const parts = s.split(';');
  const point = parseInt(parts[0].slice(1), 10);
  const nodes = parts.slice(1).map((tok, i) => {
    const [l, d] = tok.split('=');
    return { i, less1: +l, dec: d ? d.split('.').map(Number) : null };
  });
  return { point, nodes };
}

// Short content hash used as a stable pattern ID (FNV-1a, 32 bit).
export function patternId(s) {
  let h = 0x811c9dc5;
  for (let k = 0; k < s.length; k++) {
    h ^= s.charCodeAt(k);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, '0').slice(-6);
}
