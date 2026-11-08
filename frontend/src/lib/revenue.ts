/**
 * Revenue estimate for a quarter: volume × price, nothing more. Kept deliberately simple
 * so every step can be printed next to the result; the caveats (hedging, tariffs,
 * volumes sold vs produced) are shown in the UI rather than modelled.
 */
import { BOE_PER_SM3 } from './units';

/** Energy content of Norwegian sales gas, kWh per Sm³ (gross calorific value, typical). */
export const GAS_KWH_PER_SM3 = 10.8;

export interface RevenueInputs {
  /** Average production over the quarter, kboe/d. */
  kboed: number;
  /** Oil + NGL/condensate as a fraction of oil equivalent; gas is the rest. */
  liquidsShare: number;
  days: number;
  brentUsdPerBbl: number;
  ttfEurPerMwh: number;
  eurUsd: number;
  /** Realised liquids price as a percentage of Brent (NGL and quality differentials). */
  realisationPct: number;
}

export interface RevenueEstimate {
  /** Liquids volume, thousand barrels per day. */
  liquidsKbblPerDay: number;
  /** Gas volume, million Sm³ per day. */
  gasMsm3PerDay: number;
  liquidsUsd: number;
  gasUsd: number;
  totalUsd: number;
}

export function estimateRevenue(input: RevenueInputs): RevenueEstimate {
  const liquidsShare = Math.min(1, Math.max(0, input.liquidsShare));
  const liquidsKbblPerDay = input.kboed * liquidsShare;
  // Gas kboe/d → Sm³ o.e./d → Sm³ gas/d (1 Sm³ o.e. = 1,000 Sm³ gas).
  const gasSm3PerDay = ((input.kboed * (1 - liquidsShare) * 1000) / BOE_PER_SM3) * 1000;

  const liquidsUsd =
    liquidsKbblPerDay * 1000 * input.days * input.brentUsdPerBbl * (input.realisationPct / 100);
  const gasMwh = (gasSm3PerDay * input.days * GAS_KWH_PER_SM3) / 1000;
  const gasUsd = gasMwh * input.ttfEurPerMwh * input.eurUsd;

  return {
    liquidsKbblPerDay,
    gasMsm3PerDay: gasSm3PerDay / 1e6,
    liquidsUsd,
    gasUsd,
    totalUsd: liquidsUsd + gasUsd,
  };
}
