import { FEATURE_ASK } from '@/api/mode';
import type { Dict } from '@/i18n/types';
import type { IconName } from '../Icon';

export interface NavItem {
  to: string;
  /** Key into m.nav for the label. */
  label: keyof Dict['nav'];
  /** Shorter label for the mobile tab bar; items without one live in "More". */
  tab?: keyof Dict['nav'];
  icon: IconName;
  /** Exact match only (the overview at "/"). */
  end?: boolean;
  badge?: 'anomalies' | 'beta';
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'home', tab: 'homeTab', icon: 'overview', end: true },
  { to: '/map', label: 'map', tab: 'map', icon: 'map' },
  { to: '/companies', label: 'companies', tab: 'companies', icon: 'company' },
  { to: '/fields', label: 'fields', tab: 'fields', icon: 'field' },
  { to: '/track-record', label: 'trackRecord', icon: 'shield' },
  { to: '/anomalies', label: 'anomalies', icon: 'pulse', badge: 'anomalies' },
  ...(FEATURE_ASK
    ? [{ to: '/ask', label: 'ask', icon: 'chat', badge: 'beta' } satisfies NavItem]
    : []),
];
