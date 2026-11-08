import { FEATURE_ASK } from '@/api/mode';
import type { IconName } from '../Icon';

export interface NavItem {
  to: string;
  label: string;
  /** Label in the mobile tab bar; items without one only appear in the sidebar. */
  tab?: string;
  icon: IconName;
  /** Exact match only (the overview at "/"). */
  end?: boolean;
  badge?: 'anomalies' | 'beta';
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', tab: 'Overview', icon: 'overview', end: true },
  { to: '/map', label: 'Field map', tab: 'Map', icon: 'map' },
  { to: '/fields', label: 'Fields', tab: 'Fields', icon: 'field' },
  { to: '/companies', label: 'Companies', icon: 'company' },
  { to: '/track-record', label: 'Track record', tab: 'Record', icon: 'shield' },
  { to: '/anomalies', label: 'Anomalies', tab: 'Alerts', icon: 'pulse', badge: 'anomalies' },
  ...(FEATURE_ASK
    ? [{ to: '/ask', label: 'Ask the data', icon: 'chat', badge: 'beta' } satisfies NavItem]
    : []),
];
