/** Deterministic pseudo-random numbers so mock data is identical on every run and in tests. */

/** FNV-1a: a string → 32-bit seed. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: small, fast, good enough for sample data. Returns values in [0, 1). */
export function seededRandom(seed: number | string): () => number {
  let a = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fake but stable 40-hex "commit hash" for sample prediction rows. */
export function sampleHash(text: string): string {
  const rand = seededRandom(text);
  return Array.from({ length: 40 }, () => Math.floor(rand() * 16).toString(16)).join('');
}
