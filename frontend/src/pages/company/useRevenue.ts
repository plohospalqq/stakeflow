import { useMemo, useState } from 'react';
import { isSample } from '@/api/mode';
import type { CompanyMonthly, LatestPrices, Nowcast } from '@/api/types';
import { daysInQuarter, quarterOf } from '@/lib/dates';
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
  /** Prices or the nowcast volume are sample data (mocks mode). */
  isSample: boolean;
  kboed: number;
  liquidsShare: number;
  /** Months the product split was taken from. */
  splitFrom: string;
  splitTo: string;
  eurUsd: number;
  /** When the default prices were observed: Brent's day and TTF's month. */
  brentDate: string;
  ttfMonth: string;
  prices: PriceInputs;
  isAtLatest: boolean;
  estimate: RevenueEstimate;
  setPrice: (key: keyof PriceInputs, value: number) => void;
  reset: () => void;
}

/**
 * Inputs for the revenue estimate. Volume: the open-quarter nowcast when the company has
 * one, otherwise the average of the last three Sodir months. Product split: always the
 * last three Sodir months. Prices: the latest Brent, TTF and EUR/USD until the reader moves a
 * slider. Without all three prices there is no estimate rather than a made-up one.
 */
export function useRevenue(
  production: CompanyMonthly[] | undefined,
  nowcast: Nowcast | undefined,
  latest: LatestPrices | undefined,
): RevenueModel | null {
  const { m, t } = useI18n();
  const [overrides, setOverrides] = useState<Partial<PriceInputs>>({});

  const recent = useMemo(() => (production ?? []).slice(-3), [production]);

  if (!latest || recent.length === 0) return null;
  const { brentUsdPerBbl, ttfEurPerMwh, eurUsd, brentDate, ttfMonth } = latest;
  if (brentUsdPerBbl === null || ttfEurPerMwh === null || eurUsd === null) return null;
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (!first || !last) return null;

  const oe = recent.reduce((s, p) => s + p.oeSm3, 0);
  if (oe <= 0) return null;
  const days = recent.reduce((s, p) => s + p.daysInMonth, 0);
  const liquidsShare = recent.reduce((s, p) => s + p.oilSm3 + p.nglCondSm3, 0) / oe;

  const quarterStart = nowcast?.quarterStart ?? quarterOf(latest.asOf).start;
  const kboed = nowcast ? nowcast.value : sm3ToKboed(oe, days);
  const prices: PriceInputs = {
    brentUsdPerBbl: overrides.brentUsdPerBbl ?? brentUsdPerBbl,
    ttfEurPerMwh: overrides.ttfEurPerMwh ?? ttfEurPerMwh,
    realisationPct: overrides.realisationPct ?? DEFAULT_REALISATION_PCT,
  };
  const quarterDays = daysInQuarter(quarterStart);

  return {
    quarterStart,
    days: quarterDays,
    volumeLabel: nowcast
      ? t(m.revenue.volumeNowcast, { quarter: formatQuarter(quarterStart) })
      : t(m.revenue.volumeAverage, { from: formatMonth(first.month), to: formatMonth(last.month) }),
    isSample: isSample('prices') || (Boolean(nowcast) && isSample('nowcast')),
    kboed,
    liquidsShare,
    splitFrom: first.month,
    splitTo: last.month,
    eurUsd,
    brentDate: brentDate ?? latest.asOf,
    ttfMonth: ttfMonth ?? latest.asOf,
    prices,
    isAtLatest: Object.keys(overrides).length === 0,
    estimate: estimateRevenue({
      kboed,
      liquidsShare,
      days: quarterDays,
      eurUsd,
      ...prices,
    }),
    setPrice: (key, value) => setOverrides((o) => ({ ...o, [key]: value })),
    reset: () => setOverrides({}),
  };
}
