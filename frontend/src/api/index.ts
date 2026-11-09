import { createExtras } from './extras';
import { getJson, httpCore, isUnavailable, postJson } from './http';
import { answerQuestion } from './mock/ask';
import { createMockExtras } from './mock/extras';
import { mockCore } from './mock/core';
import { mockSummary } from './mock/summary';
import { DATA_SOURCE } from './mode';
import type { CoreApi, ExtrasApi, ShelfSummaryApi } from './source';
import { staticCore, staticExtras, staticSummary } from './static';
import { fetchSummary } from './summary';

const CORE_BY_SOURCE = { api: httpCore, static: staticCore, mocks: mockCore } as const;
const SUMMARY_BY_SOURCE = { api: fetchSummary, static: staticSummary, mocks: mockSummary } as const;

/** Production, ownership, reported quarters and the shelf summary: live API, static snapshot or
 * mocks (mode.ts). */
export const core: CoreApi & ShelfSummaryApi = {
  ...CORE_BY_SOURCE[DATA_SOURCE],
  summary: SUMMARY_BY_SOURCE[DATA_SOURCE],
};

const mockExtras = createMockExtras(core);
const httpExtras = createExtras(getJson, postJson);

/**
 * A 503 from Ask means the server has no AI key (or the AI or the read-only role is down): the
 * prepared examples answer instead, each marked with the reason. Any other error stays an error.
 * A missing key will not appear mid-session, so after the first such answer Ask stops asking.
 */
export function withAskPreview(api: ExtrasApi): ExtrasApi {
  let aiOff = false;
  return {
    ...api,
    async ask(question) {
      if (aiOff) return answerQuestion(question, 'aiOff');
      try {
        return await api.ask(question);
      } catch (error) {
        if (!isUnavailable(error)) throw error;
        aiOff = error.code === 'llm_not_configured';
        return answerQuestion(question, aiOff ? 'aiOff' : 'unavailable');
      }
    },
  };
}

/** The live API for everything. */
const liveExtras = withAskPreview(httpExtras);

/**
 * The static demo: the public extras from the exported files, the rest (share prices, the
 * scenario model, Ask) from the mock layer, badged as sample (mode.ts, STATIC_REAL_EXTRAS).
 */
const demoExtras: ExtrasApi = {
  ...mockExtras,
  fieldForecast: (id) => staticExtras.fieldForecast(id),
  nowcasts: () => staticExtras.nowcasts(),
  predictionLog: () => staticExtras.predictionLog(),
  anomalies: () => staticExtras.anomalies(),
  prices: () => staticExtras.prices(),
  latestPrices: () => staticExtras.latestPrices(),
};

const EXTRAS_BY_SOURCE = { api: liveExtras, static: demoExtras, mocks: mockExtras } as const;

/** Forecasts, nowcasts, predictions, anomalies, prices, scenarios and Ask. */
export const extras: ExtrasApi = EXTRAS_BY_SOURCE[DATA_SOURCE];
