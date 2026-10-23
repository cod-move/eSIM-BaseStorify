import type { Href } from 'expo-router';

import type { IconName } from '@/components/ui/icon';
import type { StatusTone } from '@/components/ui/status-chip';
import { HOME_TILE_KINDS, type Capability, type HomeTile } from '@/contracts/mobile/biz/v1';

export type HomeTileKind = HomeTile['kind'];

type TileSpec = {
  icon: IconName;
  /** The tile shows only with it, as the list it opens does (the store sends it only then, too). */
  capability: Capability;
  /** The list the figure counts. */
  href: Href;
  /** A count that asks for attention takes this tone above zero; the others stay neutral. */
  attention?: StatusTone;
  /** Server-formatted collection figure, grouped into the summary. */
  money?: boolean;
};

/**
 * What each of Home's tiles is (the contract's `home.ts`): its icon, the
 * capability it needs and the list it opens. A kind the store sends that is
 * not here is skipped.
 */
export const HOME_TILES: Record<HomeTileKind, TileSpec> = {
  COLLECTED_TODAY: {
    icon: 'wallet',
    capability: 'VIEW_ORDERS',
    href: { pathname: '/orders', params: { tab: 'all' } },
    money: true,
  },
  COLLECTED_THIS_MONTH: {
    icon: 'calendar',
    capability: 'VIEW_ORDERS',
    href: { pathname: '/orders', params: { tab: 'all' } },
    money: true,
  },
  ORDERS_NEEDING_ACTION: {
    icon: 'package',
    capability: 'VIEW_ORDERS',
    href: { pathname: '/orders', params: { tab: 'needs_action' } },
    attention: 'info',
  },
  LOW_STOCK: {
    icon: 'boxes',
    capability: 'VIEW_PRODUCTS',
    href: { pathname: '/products', params: { lowStock: 'true' } },
    attention: 'warning',
  },
  OPEN_RETURNS: {
    icon: 'return',
    capability: 'VIEW_RETURNS',
    href: { pathname: '/returns', params: { tab: 'open' } },
    attention: 'warning',
  },
  UNREAD_MESSAGES: {
    icon: 'chat',
    capability: 'VIEW_INBOX',
    href: { pathname: '/inbox', params: { unreadOnly: 'true' } },
    attention: 'info',
  },
};

export function isKnownTile(tile: { kind: string }): tile is HomeTile {
  return (HOME_TILE_KINDS as readonly string[]).includes(tile.kind);
}
