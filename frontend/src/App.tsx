import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, useRoutes } from 'react-router';
import { routes } from './routes';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Sodir data changes monthly; refetching on every focus would only add load.
      staleTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function AppRoutes() {
  return useRoutes(routes);
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
