import { httpCore } from './http';
import { createMockExtras } from './mock/extras';
import { mockCore } from './mock/core';
import { mockSummary } from './mock/summary';
import { USE_MOCKS } from './mode';
import type { CoreApi, ExtrasApi, ShelfSummaryApi } from './source';
import { fetchSummary } from './summary';

/** Production, ownership and reported quarters: live API unless VITE_USE_MOCKS=true. */
export const core: CoreApi & ShelfSummaryApi = USE_MOCKS
  ? { ...mockCore, summary: mockSummary }
  : { ...httpCore, summary: fetchSummary };

/** Everything the backend does not serve yet; always sample data. */
export const extras: ExtrasApi = createMockExtras(core);
