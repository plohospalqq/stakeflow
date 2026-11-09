import { httpCore } from './http';
import { createMockExtras } from './mock/extras';
import { mockCore } from './mock/core';
import { mockSummary } from './mock/summary';
import { DATA_SOURCE } from './mode';
import type { CoreApi, ExtrasApi, ShelfSummaryApi } from './source';
import { staticCore, staticSummary } from './static';
import { fetchSummary } from './summary';

const CORE_BY_SOURCE = { api: httpCore, static: staticCore, mocks: mockCore } as const;
const SUMMARY_BY_SOURCE = { api: fetchSummary, static: staticSummary, mocks: mockSummary } as const;

/** Production, ownership, reported quarters and the shelf summary: live API, static snapshot or
 * mocks (mode.ts). */
export const core: CoreApi & ShelfSummaryApi = {
  ...CORE_BY_SOURCE[DATA_SOURCE],
  summary: SUMMARY_BY_SOURCE[DATA_SOURCE],
};

/** Everything the backend does not serve yet; always sample data. */
export const extras: ExtrasApi = createMockExtras(core);
