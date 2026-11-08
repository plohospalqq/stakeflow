/**
 * Arps hyperbolic decline: q(t) = qi / (1 + b·Di·t)^(1/b), t in years.
 * b = 0 is exponential decline, b = 1 harmonic. Used by the sample forecast until the
 * backend serves fitted models.
 */
export function arpsRate(qi: number, b: number, di: number, years: number): number {
  if (b <= 1e-6) return qi * Math.exp(-di * years);
  return qi / Math.pow(1 + b * di * years, 1 / b);
}
