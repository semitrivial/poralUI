// app.js -- calculator UI.
import { Engine, patternId, decodePattern } from './engine.js';
import { parse, pretty, evaluate, canonicalName } from './lang.js';
import { renderPattern } from './render.js';
import { normalForm, nfHtml, nfText } from './nf.js';
import { realizePattern, verify, format as thetaFormat } from './theta.js';

const $ = s => document.querySelector(s);
const STORE = 'poral-calculator-v1';

const PRESETS = {
  'ε₀': 'P1;0;2;2=1.1',
  'Γ₀': 'P1;0;3;3;3=2.1',
};

let engine;
let state = { history: [], names: {} };   // history: [{expr, label, p, marks?}]

function load() {
  try { Object.assign(state, JSON.parse(localStorage.getItem(STORE)) || {}); } catch { /* fresh */ }
}
function save() { localStorage.setItem(STORE, JSON.stringify(state)); }

// ---------- lookup ----------
function builtins() {
  return { '0': engine.constant('0'), '1': engine.constant('1'), 'ω': engine.constant('w'), ...PRESETS };
}
const env = () => ({
  engine,
  simplify: $('#autosimp').checked,
  lookupName(name) {
    if (name === 'Ans' || name === 'ans') {
      if (!state.history.length) throw new Error('No previous answer yet.');
      return state.history[state.history.length - 1].p;
    }
    if (state.names[name]) return state.names[name];
    const b = builtins()[name];
    if (b) return b;
    throw new Error(`Unknown name '${name}'`);
  },
  lookupId(id) {
    const all = [...state.history.map(h => h.p), ...Object.values(state.names), ...Object.values(builtins())];
    const hit = all.find(p => patternId(p).startsWith(id.toLowerCase()));
    if (!hit) throw new Error(`No pattern with id #${id} in your workspace.`);
    return hit;
  },
  lookupHist(n) {
    const h = state.history[n - 1];
    if (!h) throw new Error(`No history entry $${n}.`);
    return h.p;
  },
});

function nameOf(p) {
  for (const [k, v] of Object.entries(state.names)) if (v === p) return k;
  for (const [k, v] of Object.entries(builtins())) if (v === p) return k;
  return null;
}

// ---------- evaluation ----------
function run() {
  const src = $('#input').value.trim();
  if (!src) return;
  $('#error').textContent = '';
  let ast;
  try {
    ast = parse(src);
    const t0 = performance.now();
    const r = evaluate(ast, env());
    const ms = performance.now() - t0;
    const label = pretty(ast, {
      histLabel: n => state.history[n - 1]?.label ?? `$${n}`,
      idLabel: id => { try { const p = env().lookupId(id); return nameOf(p) ?? `#${id}`; } catch { return `#${id}`; } },
    });
    if (r.type === 'bool') {
      showVerdict(label, r);
      return;
    }
    const aname = ast.k === 'assign' ? canonicalName(ast.name) : null;
    if (aname) state.names[aname] = r.p;
    state.history.push({ expr: src, label: aname ? `${aname} = ${label}` : label, p: r.p, marks: r.marks, ms });
    save();
    selected = state.history.length - 1;
    $('#input').value = '';
    renderAll();
  } catch (err) {
    $('#error').textContent = err.message;
  }
}

function showVerdict(label, r) {
  $('#verdict').innerHTML = '';
  const d = document.createElement('div');
  d.className = 'verdict ' + (r.value ? 'yes' : 'no');
  d.innerHTML = `<span class="big">${r.value ? 'true' : 'false'}</span><span>${escapeHtml(label)}</span>
    <span class="rel">(left ${r.rel === '=' ? '=' : r.rel} right)</span>`;
  $('#verdict').appendChild(d);
}

// ---------- rendering ----------
function escapeHtml(s) { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function insert(text) {
  const inp = $('#input');
  const a = inp.selectionStart ?? inp.value.length, b = inp.selectionEnd ?? a;
  inp.value = inp.value.slice(0, a) + text + inp.value.slice(b);
  inp.focus();
  inp.selectionStart = inp.selectionEnd = a + text.length;
}

function refFor(idx) {
  const h = state.history[idx];
  return nameOf(h.p) ?? `$${idx + 1}`;
}

function renderMain(h, idx) {
  const box = $('#display');
  box.innerHTML = '';
  if (!h) {
    box.innerHTML = '<div class="empty">Type an expression like <code>Γ₀ + ε₀</code> or <code>w^(w+1)</code>, or use the keys.</div>';
    return;
  }
  const pat = decodePattern(h.p);
  const head = document.createElement('div');
  head.className = 'head';
  head.innerHTML = `<div class="title">${escapeHtml(h.label)}</div>
    <div class="meta"><span class="id">#${patternId(h.p)}</span> · ${pat.nodes.length} nodes
    · point = node ${pat.point}${h.marks ? ` · operands embed at nodes ${h.marks.join(' and ')}` : ''}
    ${h.ms != null ? ` · ${h.ms.toFixed(1)} ms` : ''}</div>`;
  box.appendChild(head);
  const nfBox = document.createElement('div');
  nfBox.className = 'nf';
  try {
    const t = normalForm(engine, h.p, { ...PRESETS, ...state.names });
    nfBox.innerHTML = `<span class="nflabel">Cantor normal form</span><span class="nfval">${nfHtml(t)}</span>`;
    nfBox.title = nfText(t);
    if (nfBox.querySelector('.eps.anon'))
      nfBox.innerHTML += '<div class="nfnote">ε<sub>#id</sub> marks an epsilon number with no known name (only ε₀, Γ₀ and your own names are recognised); Cantor normal form cannot break it down further.</div>';
  } catch (err) {
    nfBox.innerHTML = `<span class="nflabel">Cantor normal form</span><span class="nferr">${escapeHtml(err.message)}</span>`;
  }
  box.appendChild(nfBox);
  // Wilken's ϑ-notation (KPℓ₀ normal form), with an independent ≤1 check.
  const thBox = document.createElement('div');
  thBox.className = 'nf';
  let nodeTerms = null;
  try {
    const r = realizePattern(pat);
    const shown = r.vals[r.point];
    nodeTerms = pat.nodes.map((_, i) => thetaFormat(r.vals[r.inserted && i >= 1 ? i + 1 : i]));
    let badge = '';
    if (pat.nodes.length <= 80) {
      const errs = verify(r);
      badge = errs.length
        ? `<span class="nferr" title="${escapeHtml(errs.join('\n'))}">✗ consistency check failed (${errs.length})</span>`
        : '<span class="nfok" title="Every node’s ϑ-term was recomputed into ≤1-reaches with Wilken’s lh-recursion; order, sums and every ≤1 relation of the pattern are reproduced exactly.">✓ verified</span>';
    }
    thBox.innerHTML = `<span class="nflabel" style="text-transform:none">ϑ-NOTATION (KPℓ₀ NF)</span><span class="nfval">${thetaFormat(shown, true)}</span>${badge}`;
    thBox.title = thetaFormat(shown);
  } catch (err) {
    thBox.innerHTML = `<span class="nflabel" style="text-transform:none">ϑ-NOTATION (KPℓ₀ NF)</span><span class="nferr">${escapeHtml(err.message)}</span>`;
  }
  box.appendChild(thBox);
  const wrap = document.createElement('div');
  wrap.className = 'svgwrap';
  wrap.appendChild(renderPattern(h.p, { marks: h.marks, nodeNotes: nodeTerms }));
  box.appendChild(wrap);
  const actions = document.createElement('div');
  actions.className = 'actions';
  const btn = (txt, fn) => { const b = document.createElement('button'); b.textContent = txt; b.onclick = fn; actions.appendChild(b); };
  btn('Use in expression', () => insert(refFor(idx)));
  btn('Name it…', () => {
    const n = prompt('Name for this pattern (letters, digits, _):', '');
    if (!n) return;
    if (!/^[A-Za-z_\u0370-\u03ff][\w\u0370-\u03ff\u2080-\u2089']*$/.test(n)) return alert('Invalid name.');
    state.names[n] = h.p; save(); renderAll();
  });
  btn('Copy share link', () => {
    const url = `${location.origin}${location.pathname}#p=${encodeURIComponent(h.p)}&l=${encodeURIComponent(h.label)}`;
    navigator.clipboard?.writeText(url);
    history.replaceState(null, '', url);
  });
  btn('Copy raw pattern', () => navigator.clipboard?.writeText(`[${h.p}]`));
  box.appendChild(actions);
  const raw = document.createElement('div');
  raw.className = 'raw';
  raw.textContent = h.p;
  box.appendChild(raw);
}

let selected = null;
function renderAll() {
  const list = $('#history');
  list.innerHTML = '';
  if (selected == null || selected >= state.history.length) selected = state.history.length - 1;
  state.history.forEach((h, i) => {
    const card = document.createElement('div');
    card.className = 'card' + (i === selected ? ' sel' : '');
    const nm = nameOf(h.p);
    card.innerHTML = `<div class="cardhead"><span class="idx">$${i + 1}</span>
      <span class="lbl">${escapeHtml(h.label)}</span>${nm && nm !== h.label ? `<span class="nm">${escapeHtml(nm)}</span>` : ''}</div>`;
    card.appendChild(renderPattern(h.p, { thumb: true, marks: h.marks }));
    const foot = document.createElement('div');
    foot.className = 'cardfoot';
    foot.textContent = `#${patternId(h.p)} · ${decodePattern(h.p).nodes.length} nodes`;
    card.appendChild(foot);
    card.onclick = () => { selected = i; renderAll(); };
    card.ondblclick = () => insert(refFor(i));
    list.prepend(card);
  });
  renderMain(state.history[selected], selected);

  const names = $('#names');
  names.innerHTML = '';
  const all = { ...builtins(), ...state.names };
  for (const k of Object.keys(all)) {
    const b = document.createElement('button');
    b.className = 'chip' + (state.names[k] ? ' user' : '');
    b.textContent = k;
    b.title = `#${patternId(all[k])}`;
    b.onclick = () => insert(k);
    names.appendChild(b);
  }
}

// ---------- keypad ----------
const KEYS = [
  ['7', '8', '9', '(', ')', '⌫'],
  ['4', '5', '6', '+', '×', 'C'],
  ['1', '2', '3', 'ω^', 'log', ','],
  ['0', 'ω', 'ε₀', 'Γ₀', 'amal', 'simp'],
  ['Ans', '<', '==', '>', '=', '⏎'],
];
function buildKeypad() {
  const pad = $('#keypad');
  for (const row of KEYS) for (const k of row) {
    const b = document.createElement('button');
    b.textContent = k === '⏎' ? '=' : k === '=' ? 'name =' : k;
    b.className = 'key' + (/^[0-9]$/.test(k) ? ' num' : '') + (k === '⏎' ? ' go' : '') + (['C', '⌫'].includes(k) ? ' warn' : '');
    b.onclick = () => {
      const inp = $('#input');
      if (k === '⏎') return run();
      if (k === 'C') { inp.value = ''; $('#error').textContent = ''; $('#verdict').innerHTML = ''; return; }
      if (k === '⌫') { inp.value = inp.value.slice(0, -1); return; }
      if (k === 'ω^') return insert('ω^(');
      if (['log', 'amal', 'simp'].includes(k)) return insert(k + '(');
      if (k === '=') return insert(' = ');
      if (['+', '×', '<', '>', '=='].includes(k)) return insert(` ${k} `);
      insert(k);
    };
    pad.appendChild(b);
  }
}

// ---------- boot ----------
async function main() {
  load();
  buildKeypad();
  $('#status').textContent = 'Loading engine…';
  engine = await Engine.create();
  $('#status').textContent = '';
  // Shared link?
  const m = new URLSearchParams(location.hash.slice(1));
  if (m.get('p')) {
    try {
      const p = engine.normalize(m.get('p'));
      if (!state.history.some(h => h.p === p)) {
        state.history.push({ expr: `[${p}]`, label: m.get('l') || `#${patternId(p)}`, p });
        save();
      }
      selected = state.history.findIndex(h => h.p === p);
    } catch (e) { $('#error').textContent = 'Shared link: ' + e.message; }
  }
  $('#input').addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
  $('#clearhist').onclick = () => {
    if (!confirm('Clear history and user-defined names?')) return;
    state = { history: [], names: {} }; save(); selected = null; renderAll();
  };
  renderAll();
  $('#input').focus();
}
main();
