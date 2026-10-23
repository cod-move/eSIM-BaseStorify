import type { Href } from 'expo-router';

import type { Capability } from '@/contracts/mobile/biz/v1';
import type { AppTarget } from '@/lib/links';

/**
 * The screen of a notification's target (`notificationTarget`, lib/links),
 * and the capability it needs: a target the operator may not see opens Home
 * instead.
 */
export function targetRoute(target: AppTarget): { href: Href; capability: Capability } {
  switch (target.screen) {
    case 'returns':
      return { href: '/returns', capability: 'VIEW_RETURNS' };
    case 'return':
      return {
        href: { pathname: '/returns/[id]', params: { id: target.id } },
        capability: 'VIEW_RETURNS',
      };
    case 'refund':
      return {
        href: { pathname: '/refunds/[id]', params: { id: target.id } },
        capability: 'VIEW_RETURNS',
      };
    case 'order':
      return {
        href: { pathname: '/orders/[id]', params: { id: target.id } },
        capability: 'VIEW_ORDERS',
      };
    case 'orders':
      return { href: '/orders', capability: 'VIEW_ORDERS' };
    case 'product':
      return {
        href: { pathname: '/products/[id]', params: { id: target.id } },
        capability: 'VIEW_PRODUCTS',
      };
    case 'stock':
      return {
        href: { pathname: '/products/[id]/stock', params: { id: target.id } },
        capability: 'VIEW_STOCK',
      };
    case 'products':
      // A low-stock alert names no product: its list, filtered.
      return {
        href: target.lowStock
          ? { pathname: '/products', params: { lowStock: 'true' } }
          : '/products',
        capability: 'VIEW_PRODUCTS',
      };
    case 'conversation':
      return {
        href: { pathname: '/conversations/[id]', params: { id: target.id } },
        capability: 'VIEW_INBOX',
      };
    case 'inbox':
      return { href: '/inbox', capability: 'VIEW_INBOX' };
    case 'application':
      return {
        href: { pathname: '/applications/[id]', params: { id: target.id } },
        capability: 'REVIEW_VENDOR_APPLICATIONS',
      };
    case 'applications':
      return { href: '/more/applications', capability: 'REVIEW_VENDOR_APPLICATIONS' };
    case 'payout':
      return {
        href: { pathname: '/payouts/[id]', params: { id: target.id } },
        capability: 'VIEW_PAYOUTS',
      };
    case 'payouts':
      return { href: '/more/payouts', capability: 'VIEW_PAYOUTS' };
  }
}
