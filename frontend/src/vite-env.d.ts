/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCKS?: string;
  readonly VITE_DATA_SOURCE?: string;
  readonly VITE_FEATURE_ASK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
