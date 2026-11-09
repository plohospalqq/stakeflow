import { useMemo, useState } from 'react';
import type { CompanyMonthly, ForwardPrices, Nowcast } from '@/api/types';
import { daysInQuarter } from '@/lib/dates';
import { useI18n } from '@/i18n/useI18n';
import { formatMonth, formatQuarter } from '@/lib/format';
import { estimateRevenue, type RevenueEstimate } from '@/lib/revenue';
import { sm3ToKboed } from '@/lib/units';

/** NCS liquids sell close to Brent but NGL sells well below it; 98% is a neutral start. */
export const DEFAULT_REALISATION_PCT = 98;

export interface PriceInputs {
  brentUsdPerBbl: number;
  ttfEurPerMwh: number;
  realisationPct: number;
}

export interface RevenueModel {
  quarterStart: string;
  days: number;
  /** What the volume is based on, in words. */
  volumeLabel: string;
  /** True when the volume itself is sample data (the nowcast). */
  volumeIsSample: boolean;
  kboed: number;
  liquidsShare: number;
  /** Months the product split was taken from. */
  splitFrom: string;
  splitTo: string;
  eurUsd: number;
  forwardAsOf: string;
  prices: PriceInputs;
  isAtForward: boolean;
  estimate: RevenueEstimate;
  setPrice: (key: keyof PriceInputs, value: number) => void;
  reset: () => void;
}

/**
 * Inputs for the revenue estimate. Volume: the open-quarter nowcast when the company has
 * one, otherwise the average of the last three Sodir months. Product split: always the
 * last three Sodir months. Prices: forward prices until the reader moves a slider.
 */
export function useRevenue(
  production: CompanyMonthly[] | undefined,
  nowcast: Nowcast | undefined,
  forward: ForwardPrices | undefined,
): RevenueModel | null {
  const { m, t } = useI18n();
  const [overrides, setOverrides] = useState<Partial<PriceInputs>>({});

  const recent = useMemo(() => (production ?? []).slice(-3), [production]);

  if (!forward || recent.length === 0) return null;
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (!first || !last) return null;

  const oe = recent.reduce((s, p) => s + p.oeSm3, 0);
  if (oe <= 0) return null;
  const days = recent.reduce((s, p) => s + p.daysInMonth, 0);
  const liquidsShare = recent.reduce((s, p) => s + p.oilSm3 + p.nglCondSm3, 0) / oe;

  const quarterStart = nowcast?.quarterStart ?? forward.quarterStart;
  const kboed = nowcast ? nowcast.value : sm3ToKboed(oe, days);
  const prices: PriceInputs = {
    brentUsdPerBbl: overrides.brentUsdPerBbl ?? forward.brentUsdPerBbl,
    ttfEurPerMwh: overrides.ttfEurPerMwh ?? forward.ttfEurPerMwh,
    realisationPct: overrides.realisationPct ?? DEFAULT_REALISATION_PCT,
  };
  const quarterDays = daysInQuarter(quarterStart);

  return {
    quarterStart,
    days: quarterDays,
    volumeLabel: nowcast
      ? t(m.revenue.volumeNowcast, { quarter: formatQuarter(quarterStart) })
      : t(m.revenue.volumeAverage, { from: formatMonth(first.month), to: formatMonth(last.month) }),
    volumeIsSample: Boolean(nowcast),
    kboed,
    liquidsShare,
    splitFrom: first.month,
    splitTo: last.month,
    eurUsd: forward.eurUsd,
    forwardAsOf: forward.asOf,
    prices,
    isAtForward: Object.keys(overrides).length === 0,
    estimate: estimateRevenue({
      kboed,
      liquidsShare,
      days: quarterDays,
      eurUsd: forward.eurUsd,
      ...prices,
    }),
    setPrice: (key, value) => setOverrides((o) => ({ ...o, [key]: value })),
    reset: () => setOverrides({}),
  };
}
