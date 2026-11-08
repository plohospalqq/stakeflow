/** Scoring of the prediction log: the numbers behind the track-record page. */
import type { Prediction } from '@/api/types';

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
