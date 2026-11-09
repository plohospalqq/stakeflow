/** Product split of a volume as fractions of oil equivalent; they add up to 1. */
export interface Mix {
  oil: number;
  gas: number;
  /** NGL + condensate, drawn in the condensate colour. */
  nglCond: number;
}

/** Key into the dictionary's products.kind. */
export type ProductKind = 'mainlyOil' | 'mainlyGas' | 'gasCond' | 'oilGas' | 'gasOil';

/** 'Mainly oil', 'Oil and gas', ... from the product split (used in chips). */
export function productKind(mix: Mix): ProductKind {
  if (mix.oil >= 0.75) return 'mainlyOil';
  if (mix.gas >= 0.75) return 'mainlyGas';
  if (mix.nglCond >= 0.4) return 'gasCond';
  return mix.oil >= mix.gas ? 'oilGas' : 'gasOil';
}

/** The product colour that dominates a kind, or null for mixed fields. */
export function productKindColor(kind: ProductKind): string | null {
  if (kind === 'mainlyOil') return 'var(--oil)';
  if (kind === 'mainlyGas') return 'var(--gas)';
  if (kind === 'gasCond') return 'var(--cnd)';
  return null;
}
