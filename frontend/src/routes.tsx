import { lazy } from 'react';
import { Navigate, type RouteObject } from 'react-router';
import { FEATURE_ASK } from '@/api/mode';
import { AppShell } from '@/components/layout/AppShell';
import Placeholder from '@/pages/Placeholder';

const NotFound = lazy(() => import('@/pages/NotFound'));

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <Placeholder label="Overview" title="Who produces what on the Norwegian shelf" />,
      },
      { path: 'map', element: <Placeholder label="Field map" title="Where the production is" /> },
      { path: 'fields', element: <Placeholder label="Fields" title="Every field on the shelf" /> },
      { path: 'fields/:id', element: <Placeholder label="Fields" title="Field detail" /> },
      { path: 'companies', element: <Navigate to="/companies/aker-bp" replace /> },
      { path: 'companies/:id', element: <Placeholder label="Companies" title="Company detail" /> },
      {
        path: 'track-record',
        element: <Placeholder label="Track record" title="Every prediction, scored" />,
      },
      {
        path: 'anomalies',
        element: <Placeholder label="Anomalies" title="Unexpected drops and spikes" />,
      },
      ...(FEATURE_ASK
        ? [{ path: 'ask', element: <Placeholder label="Ask the data" title="Ask the data" /> }]
        : []),
      { path: '*', element: <NotFound /> },
    ],
  },
];
