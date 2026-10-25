// Known values: node tests/theta-known.mjs   (run from web/, after build.sh)
import { Engine, decodePattern } from '../engine.js';
import { realizePattern, verify, format } from '../theta.js';
const E = await Engine.create();
const cases = [
  ['P2;0;1;2', 'ω'],
  ['P1;0;2;2=1.1', 'ϑ(Ω₁)'],                          // ε₀
  ['P1;0;3;3;3=2.1', 'ϑ(ϑ₁(Ω₁))'],                    // Γ₀ = ϑ(Ω²)
  ['P1;0;3;3;3=2.2', 'ϑ(ϑ₁(Ω₂))'],                    // Bachmann–Howard, |ID₁|
  ['P1;0;4;4;4;4=3.3', 'ϑ(ϑ₁(ϑ₂(Ω₃)))'],              // |ID₂|  ([AO] Cor. 5.2)
];
let bad = 0;
for (const [raw, want] of cases) {
  const r = realizePattern(decodePattern(E.simplify(E.normalize(raw))));
  const got = format(r.vals[r.point]), errs = verify(r);
  const ok = got === want && !errs.length;
  if (!ok) bad++;
  console.log(ok ? '✓' : '✗', raw.padEnd(18), got, ok ? '' : `(want ${want}; ${errs[0] ?? ''})`);
}
process.exit(bad ? 1 : 0);
