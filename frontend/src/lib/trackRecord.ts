/** Scoring of the prediction log: the numbers behind the track-record page. */
import type { Prediction, ReportedQuarter } from '@/api/types';
import { diffDays, quarterOf } from './dates';

/** Signed error in percent: (predicted − actual) / actual. */
export function errorPct(predicted: number, actual: number): number {
  return ((predicted - actual) / actual) * 100;
}

export interface ModelStats {
  resolved: number;
  /** Mean absolute % error of the model. */
  modelError: number;
  /**
   * Mean absolute % error of "same as last quarter", and how many times smaller the model's
   * error is, both on the quarters that have a previous figure; null when none does.
   */
  baselineError: number | null;
  improvement: number | null;
  /** Actuals inside the 80% range. */
  inRange: number;
  /** Mean signed error: positive = predictions run high. */
  bias: number;
  quarters: number;
  firstQuarter: string;
  lastQuarter: string;
}

type Scored = Prediction & { actual: number };

const isScored = (p: Prediction): p is Scored => p.status === 'resolved' && p.actual !== null;

const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;

/** Call it per kind: live and backtest rows are never pooled. */
export function modelStats(log: Prediction[]): ModelStats | null {
  const done = log.filter(isScored);
  if (done.length === 0) return null;
  const model = done.map((p) => errorPct(p.predicted, p.actual));
  const paired = done.filter((p): p is Scored & { baseline: number } => p.baseline !== null);
  const quarters = [...new Set(done.map((p) => p.quarterStart))].sort();
  const pairedModel = mean(paired.map((p) => Math.abs(errorPct(p.predicted, p.actual))));
  const baselineError = paired.length
    ? mean(paired.map((p) => Math.abs(errorPct(p.baseline, p.actual))))
    : null;
  return {
    resolved: done.length,
    modelError: mean(model.map(Math.abs)),
    baselineError,
    improvement: baselineError !== null && pairedModel > 0 ? baselineError / pairedModel : null,
    inRange: done.filter((p) => p.actual >= p.lo && p.actual <= p.hi).length,
    bias: mean(model),
    quarters: quarters.length,
    firstQuarter: quarters[0] ?? '',
    lastQuarter: quarters[quarters.length - 1] ?? '',
  };
}

/**
 * When a prediction counts as made. An open quarter freezes at its end; a backtest stands in
 * for a freeze at its as-of date (the computer ran it much later); a live row when it ran.
 */
export function frozenAt(p: Prediction): string {
  if (p.status === 'open' || p.actual === null) return `${quarterOf(p.quarterStart).end}T23:59:00Z`;
  if (p.kind === 'backtest') return `${p.asOf}T23:59:00Z`;
  return p.madeAt;
}

/**
 * One row per quarter: a live prediction beats a backtest of the same quarter, and within a
 * kind the newest row counts (revisions are new rows).
 */
export function latestPerQuarter(predictions: Prediction[]): Prediction[] {
  const rank = (p: Prediction) => `${p.kind === 'live' ? 1 : 0}${p.madeAt}`;
  const byQuarter = new Map<string, Prediction>();
  for (const p of [...predictions].sort((a, b) => rank(a).localeCompare(rank(b)))) {
    byQuarter.set(p.quarterStart, p);
  }
  return [...byQuarter.values()].sort((a, b) => a.quarterStart.localeCompare(b.quarterStart));
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
  /** Null when no company had a previous quarter to repeat. */
  baseline: number | null;
  count: number;
}

export function accuracyByQuarter(log: Prediction[]): QuarterAccuracy[] {
  const byQuarter = new Map<string, { model: number[]; baseline: number[] }>();
  for (const p of log) {
    if (!isScored(p)) continue;
    const entry = byQuarter.get(p.quarterStart) ?? { model: [], baseline: [] };
    entry.model.push(Math.abs(errorPct(p.predicted, p.actual)));
    if (p.baseline !== null) entry.baseline.push(Math.abs(errorPct(p.baseline, p.actual)));
    byQuarter.set(p.quarterStart, entry);
  }
  return [...byQuarter.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([quarterStart, e]) => ({
      quarterStart,
      model: mean(e.model),
      baseline: e.baseline.length ? mean(e.baseline) : null,
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
