/**
 * Where numbers come from (VITE_DATA_SOURCE):
 * - `api` (default): the live API for everything. Ask falls back to its prepared examples
 *   when the server has no AI key, and says so on each answer.
 * - `static`: the GitHub Pages demo. Production, forecasts, nowcasts, the prediction log,
 *   anomalies and Brent/TTF prices are real, read from JSON files the exporter wrote from the
 *   API at build time. Share prices and the scenario model are sample data there: they derive
 *   from Euronext prices, which may not be redistributed. Ask is a preview (no server).
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

/** Production, ownership, reported quarters, outlines: real unless everything is mocked. */
export type CoreKind = 'production' | 'ownership' | 'reported' | 'fields' | 'outlines';

/** Models, markets and Ask. */
export type ExtraKind =
  'forecast' | 'nowcast' | 'predictions' | 'anomalies' | 'prices' | 'scenario' | 'ask';

/** What the static demo carries for real: public data, licensed for display with credit. */
export const STATIC_REAL_EXTRAS: readonly ExtraKind[] = [
  'forecast',
  'nowcast',
  'predictions',
  'anomalies',
  'prices',
];

const CORE_KINDS: readonly string[] = ['production', 'ownership', 'reported', 'fields', 'outlines'];

/**
 * Whether a kind of data is sample data in a given mode. Ask in live mode is real; a prepared
 * answer shown because the server has no AI key carries its own badge (AskReply.preview).
 */
export function isSampleIn(source: DataSource, kind: CoreKind | ExtraKind): boolean {
  if (source === 'mocks') return true;
  if (CORE_KINDS.includes(kind) || source === 'api') return false;
  return !STATIC_REAL_EXTRAS.some((k) => k === kind);
}

export function isSample(kind: CoreKind | ExtraKind): boolean {
  return isSampleIn(DATA_SOURCE, kind);
}
