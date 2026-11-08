import type { Anomaly } from '@/api/types';

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 } as const;

/** Feed order: most severe first, then newest. */
export function sortAnomalies(list: Anomaly[]): Anomaly[] {
  return [...list].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.month.localeCompare(a.month),
  );
}
