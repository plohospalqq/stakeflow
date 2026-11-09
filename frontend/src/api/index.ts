import { httpCore } from './http';
import { createMockExtras } from './mock/extras';
import { mockCore } from './mock/core';
import { DATA_SOURCE } from './mode';
import type { CoreApi, ExtrasApi } from './source';
import { staticCore } from './static';

const CORE_BY_SOURCE = { api: httpCore, static: staticCore, mocks: mockCore } as const;

/** Production, ownership and reported quarters: live API, static snapshot or mocks (mode.ts). */
export const core: CoreApi = CORE_BY_SOURCE[DATA_SOURCE];

/** Everything the backend does not serve yet; always sample data. */
export const extras: ExtrasApi = createMockExtras(core);
