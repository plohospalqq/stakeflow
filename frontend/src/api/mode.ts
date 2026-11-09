/**
 * Where numbers come from (VITE_DATA_SOURCE):
 * - `api` (default): the live API for everything it serves, the deterministic mock layer for
 *   what the backend does not have yet.
 * - `static`: the same real numbers, read from JSON files the exporter wrote from the API at
 *   build time. This is the GitHub Pages demo: no backend, data frozen at the snapshot.
 * - `mocks`: the mock layer for everything (tests, CI, demos without data).
 *   VITE_USE_MOCKS=true is the older spelling and still wins.
 */
export type DataSource = 'api' | 'static' | 'mocks';

export function parseDataSource(env: {
  VITE_DATA_SOURCE?: string;
  VITE_USE_MOCKS?: string;
}): DataSource {
  if (env.VITE_USE_MOCKS === 'true') return 'mocks';
  if (env.VITE_DATA_SOURCE === 'static' || env.VITE_DATA_SOURCE === 'mocks') {
    return env.VITE_DATA_SOURCE;
  }
  return 'api';
}

export const DATA_SOURCE: DataSource = parseDataSource(import.meta.env);

export const USE_MOCKS = DATA_SOURCE === 'mocks';

export const IS_STATIC_DEMO = DATA_SOURCE === 'static';

export const FEATURE_ASK = import.meta.env.VITE_FEATURE_ASK === 'true';

/** Data kinds the backend serves. Their sample-ness depends on USE_MOCKS. */
export type CoreKind = 'production' | 'ownership' | 'reported' | 'fields' | 'outlines';

/** Data kinds that are always sample data until the backend grows them. */
export type ExtraKind = 'forecast' | 'nowcast' | 'predictions' | 'anomalies' | 'prices' | 'ask';

export function isSample(kind: CoreKind | ExtraKind): boolean {
  switch (kind) {
    case 'production':
    case 'ownership':
    case 'reported':
    case 'fields':
    case 'outlines':
      return USE_MOCKS;
    default:
      return true;
  }
}

export const SAMPLE_PARTS_TEXT =
  'forecasts and model cards, nowcasts and the prediction log, anomalies, Brent/TTF prices and Ask answers';
