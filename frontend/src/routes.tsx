import { lazy } from 'react';
import { Navigate, type RouteObject } from 'react-router';
import { FEATURE_ASK } from '@/api/mode';
import { AppShell } from '@/components/layout/AppShell';
import Placeholder from '@/pages/Placeholder';

const NotFound = lazy(() => import('@/pages/NotFound'));
const Overview = lazy(() => import('@/pages/Overview'));
const FieldsIndex = lazy(() => import('@/pages/FieldsIndex'));
const FieldDetail = lazy(() => import('@/pages/FieldDetail'));
const FieldMap = lazy(() => import('@/pages/FieldMap'));
const CompanyDetail = lazy(() => import('@/pages/CompanyDetail'));
const TrackRecord = lazy(() => import('@/pages/TrackRecord'));
const DevComponents = lazy(() => import('@/pages/DevComponents'));

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Overview /> },
      { path: 'map', element: <FieldMap /> },
      { path: 'fields', element: <FieldsIndex /> },
      { path: 'fields/:id', element: <FieldDetail /> },
      { path: 'companies', element: <Navigate to="/companies/aker-bp" replace /> },
      { path: 'companies/:id', element: <CompanyDetail /> },
      { path: 'track-record', element: <TrackRecord /> },
      {
        path: 'anomalies',
        element: <Placeholder label="Anomalies" title="Unexpected drops and spikes" />,
      },
      ...(FEATURE_ASK
        ? [{ path: 'ask', element: <Placeholder label="Ask the data" title="Ask the data" /> }]
        : []),
      { path: 'dev/components', element: <DevComponents /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];
