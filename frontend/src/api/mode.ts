/**
 * Where numbers come from. Default: the live API for everything it serves, and the
 * deterministic mock layer for what the backend does not have yet. VITE_USE_MOCKS=true
 * mocks everything (tests, CI, demos without a backend).
 */
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';

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
