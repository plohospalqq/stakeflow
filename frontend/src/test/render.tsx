import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import {
  MemoryRouter,
  useLocation,
  useRoutes,
  type Location,
  type RouteObject,
} from 'react-router';

/** Lets tests read where the router ended up (e.g. ?u= after a unit toggle). */
export const lastLocation: { current: Location | null } = { current: null };

function LocationSpy() {
  lastLocation.current = useLocation();
  return null;
}

function Routes({ routes }: { routes: RouteObject[] }) {
  return useRoutes(routes);
}

/**
 * Renders inside a memory router and a fresh query client. Declarative routing on purpose:
 * data routers build fetch Requests whose AbortSignal jsdom and Node disagree about.
 */
export function renderWithProviders(
  ui: ReactElement,
  {
    route = '/',
    path = '*',
    routes,
  }: { route?: string; path?: string; routes?: RouteObject[] } = {},
): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <LocationSpy />
        <Routes routes={routes ?? [{ path, element: ui }]} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
