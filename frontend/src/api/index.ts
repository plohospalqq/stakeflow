import { httpCore } from './http';
import { createMockExtras } from './mock/extras';
import { mockCore } from './mock/core';
import { USE_MOCKS } from './mode';
import type { CoreApi, ExtrasApi } from './source';

/** Production, ownership and reported quarters: live API unless VITE_USE_MOCKS=true. */
export const core: CoreApi = USE_MOCKS ? mockCore : httpCore;

/** Everything the backend does not serve yet; always sample data. */
export const extras: ExtrasApi = createMockExtras(core);
