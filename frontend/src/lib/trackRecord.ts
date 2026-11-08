/** Scoring of the prediction log: the numbers behind the track-record page. */
import type { Prediction, ReportedQuarter } from '@/api/types';
import { diffDays } from './dates';

/** Signed error in percent: (predicted − actual) / actual. */
export function errorPct(predicted: number, actual: number): number {
  return ((predicted - actual) / actual) * 100;
}

export interface ModelStats {
  resolved: number;
  /** Mean absolute % error of the model. */
  modelError: number;
  /** Mean absolute % error of "same as last quarter". */
  baselineError: number;
  /** How many times smaller the model error is. */
  improvement: number;
  /** Actuals inside the 80% range. */
  inRange: number;
  /** Mean signed error: positive = predictions run high. */
  bias: number;
  quarters: number;
  firstQuarter: string;
  lastQuarter: string;
}

export function modelStats(log: Prediction[]): ModelStats | null {
  const done = log.filter(
    (p): p is Prediction & { actual: number } => p.status === 'resolved' && p.actual !== null,
  );
  if (done.length === 0) return null;
  const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;
  const model = done.map((p) => errorPct(p.predicted, p.actual));
  const baseline = done.map((p) => errorPct(p.baseline, p.actual));
  const quarters = [...new Set(done.map((p) => p.quarterStart))].sort();
  const modelError = mean(model.map(Math.abs));
  const baselineError = mean(baseline.map(Math.abs));
  return {
    resolved: done.length,
    modelError,
    baselineError,
    improvement: modelError > 0 ? baselineError / modelError : 0,
    inRange: done.filter((p) => p.actual >= p.lo && p.actual <= p.hi).length,
    bias: mean(model),
    quarters: quarters.length,
    firstQuarter: quarters[0] ?? '',
    lastQuarter: quarters[quarters.length - 1] ?? '',
  };
}

/**
 * Days between the prediction and the company's publication. Calendar days in UTC, so a
 * forecast frozen at 23:59 on 30 Sep and scored against a 14 Oct trading update is T+14.
 */
export function leadDays(madeAt: string, reportOn: string): number {
  return diffDays(madeAt.slice(0, 10), reportOn);
}

export type ErrorTone = 'good' | 'fair' | 'poor';

/** Under 2% is on target, 2–4% acceptable, above 4% a miss. */
export function errorTone(pct: number): ErrorTone {
  const abs = Math.abs(pct);
  if (abs < 2) return 'good';
  if (abs < 4) return 'fair';
  return 'poor';
}

export interface QuarterAccuracy {
  quarterStart: string;
  /** Mean absolute % error of the model and of the baseline in that quarter. */
  model: number;
  baseline: number;
  count: number;
}

export function accuracyByQuarter(log: Prediction[]): QuarterAccuracy[] {
  const byQuarter = new Map<string, { model: number[]; baseline: number[] }>();
  for (const p of log) {
    if (p.status !== 'resolved' || p.actual === null) continue;
    const entry = byQuarter.get(p.quarterStart) ?? { model: [], baseline: [] };
    entry.model.push(Math.abs(errorPct(p.predicted, p.actual)));
    entry.baseline.push(Math.abs(errorPct(p.baseline, p.actual)));
    byQuarter.set(p.quarterStart, entry);
  }
  const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;
  return [...byQuarter.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([quarterStart, e]) => ({
      quarterStart,
      model: mean(e.model),
      baseline: mean(e.baseline),
      count: e.model.length,
    }));
}

/** A quarter where both the Sodir-attributed and the company-reported figure exist. */
export interface Reconciled {
  companyId: string;
  quarter: ReportedQuarter & { reportedKboed: number; errorPct: number };
}

export function reconciledQuarters(companyId: string, quarters: ReportedQuarter[]): Reconciled[] {
  return quarters
    .filter(
      (q): q is ReportedQuarter & { reportedKboed: number; errorPct: number } =>
        q.reportedKboed !== null && q.errorPct !== null,
    )
    .map((quarter) => ({ companyId, quarter }));
}

export interface ReconciliationSummary {
  /** Quarters with all three months in Sodir data. */
  complete: number;
  /** Quarters still missing a month: their gap is provisional. */
  partial: number;
  /** Mean absolute gap over complete quarters, percent; null when there are none. */
  meanAbsGap: number | null;
  maxAbsGap: number | null;
}

/** Partial quarters are listed but kept out of the average: a missing month is not an error. */
export function reconciliationSummary(rows: Reconciled[]): ReconciliationSummary {
  const complete = rows.filter((r) => r.quarter.isComplete);
  const gaps = complete.map((r) => Math.abs(r.quarter.errorPct));
  return {
    complete: complete.length,
    partial: rows.length - complete.length,
    meanAbsGap: gaps.length ? gaps.reduce((s, v) => s + v, 0) / gaps.length : null,
    maxAbsGap: gaps.length ? Math.max(...gaps) : null,
  };
}
