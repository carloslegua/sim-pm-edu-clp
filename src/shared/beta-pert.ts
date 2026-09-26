// Muestreo de una duración Beta-PERT -- lógica PURA. Vive aparte para que el análisis de rangos y eventos de riesgo (range-estimating.ts) y la simulación
// de la red PERT (pert-network.ts) compartan UNA sola implementación sin importarse entre sí.
const normal = (rnd: () => number): number => { const u = Math.max(rnd(), 1e-12), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
// Gamma(k, 1) con k ≥ 1 (Marsaglia–Tsang).
function gamma(k: number, rnd: () => number): number {
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = normal(rnd), t = 1 + c * x; if (t <= 0) continue;
    const v = t * t * t, u = rnd();
    if (Math.log(Math.max(u, 1e-300)) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
  }
}
// Una duración Beta-PERT en [o, p] con moda m. Terna degenerada (p ≤ o): la duración más probable.
export function samplePert(o: number, m: number, p: number, rnd: () => number): number {
  if (!(p > o)) return m;
  const a = 1 + 4 * (m - o) / (p - o), b = 1 + 4 * (p - m) / (p - o), ga = gamma(a, rnd), gb = gamma(b, rnd);
  return o + (ga / (ga + gb)) * (p - o);
}
