import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, vi } from 'vitest';

// ECharts needs a real canvas; tests check the accessible summary instead of pixels.
vi.mock('@/components/charts/EChart', () => ({
  EChart: ({ ariaLabel }: { ariaLabel: string }) =>
    createElement('div', { role: 'img', 'aria-label': ariaLabel }),
}));

// jsdom has no WebGL. The map page is tested through its list and side panel, which are
// the keyboard and screen-reader way in anyway.
vi.mock('@/pages/map/FieldMapCanvas', () => ({
  FieldMapCanvas: () => createElement('div', { 'data-testid': 'map-canvas' }),
}));

// Node 25+ ships an experimental global `localStorage` that is undefined without
// --localstorage-file and shadows jsdom's. Give tests a plain in-memory Storage instead.
if (typeof window.localStorage === 'undefined') {
  const data = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memoryStorage });
  Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage });
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

// jsdom has no matchMedia; components use it for theme and layout queries. Tests run with
// reduced motion, like a reader who asked for it: count-ups show their final value at once.
// The motion test overrides this to check the animated path too.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string): MediaQueryList => {
      const mql: MediaQueryList = {
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      };
      return mql;
    },
  });
}

// jsdom has no ResizeObserver; charts and tables use it to size themselves.
if (!('ResizeObserver' in window)) {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(window, 'ResizeObserver', { writable: true, value: ResizeObserverStub });
}

// jsdom does not implement scrolling.
window.scrollTo = () => undefined;
Element.prototype.scrollIntoView = () => undefined;
