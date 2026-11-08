import { lazy } from 'react';
import { Navigate, type RouteObject } from 'react-router';
import { FEATURE_ASK } from '@/api/mode';
import { AppShell } from '@/components/layout/AppShell';

const NotFound = lazy(() => import('@/pages/NotFound'));
const Overview = lazy(() => import('@/pages/Overview'));
const FieldsIndex = lazy(() => import('@/pages/FieldsIndex'));
const FieldDetail = lazy(() => import('@/pages/FieldDetail'));
const FieldMap = lazy(() => import('@/pages/FieldMap'));
const Anomalies = lazy(() => import('@/pages/Anomalies'));
const Ask = lazy(() => import('@/pages/Ask'));
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
      { path: 'anomalies', element: <Anomalies /> },
      ...(FEATURE_ASK ? [{ path: 'ask', element: <Ask /> }] : []),
      { path: 'dev/components', element: <DevComponents /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];
