import { formatShare } from './format';

/** Product split of a volume as fractions of oil equivalent; they add up to 1. */
export interface Mix {
  oil: number;
  gas: number;
  /** NGL + condensate, drawn in the condensate colour. */
  nglCond: number;
}

export function mixLabel(mix: Mix): string {
  return `Oil ${formatShare(mix.oil)}, gas ${formatShare(mix.gas)}, NGL and condensate ${formatShare(mix.nglCond)}`;
}

/** 'Mainly oil', 'Oil and gas', ... from the product split (used in chips). */
export function productKind(mix: Mix): string {
  if (mix.oil >= 0.75) return 'Mainly oil';
  if (mix.gas >= 0.75) return 'Mainly gas';
  if (mix.nglCond >= 0.4) return 'Gas and condensate';
  return mix.oil >= mix.gas ? 'Oil and gas' : 'Gas and oil';
}
