import type { Workspace } from '@/contracts/mobile/biz/v1';
import { BUNDLED_LOCALES } from '@/i18n/locales';

/**
 * Where a notification leads. The store's notifications (in GET /notifications
 * and in a push's `data`) carry a link to a page of its web dashboard, with
 * the language in front: `/en/vendor/orders/ord_1`. The app has a screen for
 * some of those pages; this says which, without knowing the screens' routes
 * (the navigation turns a target into a route).
 *
 * `null`: the app has no screen for it; open the page in a browser, on the
 * store's address (`Config.store.websiteUrl`).
 */
export type AppTarget =
  | { screen: 'order'; id: string }
  | { screen: 'orders' }
  | { screen: 'product'; id: string }
  /** A product's stock: the store's own low-stock alert names the product. */
  | { screen: 'stock'; id: string }
  /** The product list; `lowStock` for a low-stock alert, whose link names no product. */
  | { screen: 'products'; lowStock: boolean }
  | { screen: 'conversation'; id: string }
  | { screen: 'inbox' }
  | { screen: 'application'; id: string }
  | { screen: 'applications' }
  | { screen: 'payout'; id: string }
  | { screen: 'payouts' }
  | { screen: 'returns' }
  | { screen: 'return'; id: string }
  | { screen: 'refund'; id: string };

const LOCALES = new Set<string>(BUNDLED_LOCALES);
const DASHBOARDS = new Set(['admin', 'vendor', 'staff']);

/** The notification type of a low-stock alert: the seller's product list, or the store's product editor. */
const LOW_STOCK = 'product_low_stock';

/**
 * The screen a notification's link opens.
 *
 * `/en/admin/orders/ord_1`, `/vendor/orders/ord_1`, `/staff/orders/ord_1` → the order
 * `/en/vendor/inbox?conversation=c1`, `/admin/inbox?view=chat&conversation=c1` → the thread
 * `/en/admin/vendors/v1` → the seller's application
 * `/en/vendor/payouts/p1` → the payout
 * `/en/vendor/products` with type `product_low_stock` → the low-stock list
 * `/en/admin/products/p1/edit`, `/staff/products/p1/edit` with type `product_low_stock` → its stock
 * `/en/staff/inventory` with type `product_low_stock` → the low-stock list
 */
export function notificationTarget(link: string, type?: string): AppTarget | null {
  const { segments, params } = parse(link);
  if (LOCALES.has(segments[0]?.toLowerCase() ?? '')) segments.shift();

  const [dashboard = '', area, id, ...rest] = segments;
  if (!DASHBOARDS.has(dashboard)) return null;
  // Deeper than an item, the app has a screen for one page only: a product's editor.
  const editor = area === 'products' && rest.length === 1 && rest[0] === 'edit';
  if (rest.length > 0 && !editor) return null;

  switch (area) {
    case 'returns':
      return id ? { screen: 'return', id } : { screen: 'returns' };
    case 'refunds':
      return id ? { screen: 'refund', id } : { screen: 'returns' };
    case 'orders':
      return id ? { screen: 'order', id } : { screen: 'orders' };
    case 'products':
      if (!id) return { screen: 'products', lowStock: type === LOW_STOCK };
      return editor && type === LOW_STOCK ? { screen: 'stock', id } : { screen: 'product', id };
    case 'inventory':
      // The store's staff's stock page: the low-stock list when the alert names no product.
      return id ? null : { screen: 'products', lowStock: type === LOW_STOCK };
    case 'inbox': {
      const conversation = params.get('conversation');
      if (id) return null;
      return conversation ? { screen: 'conversation', id: conversation } : { screen: 'inbox' };
    }
    case 'vendors':
      // A seller's application is reviewed by administrators only.
      if (dashboard !== 'admin') return null;
      return id ? { screen: 'application', id } : { screen: 'applications' };
    case 'payouts':
      if (dashboard !== 'vendor') return null;
      return id ? { screen: 'payout', id } : { screen: 'payouts' };
    default:
      return null;
  }
}

/**
 * The workspace a notification's link is about, by its dashboard: a seller's
 * (`/vendor/…`) or the store's (`/admin/…`, `/staff/…`). `null` for a link
 * that is not a dashboard's. The screen it opens must be opened there.
 */
export function notificationWorkspace(link: string): Workspace | null {
  const { segments } = parse(link);
  if (LOCALES.has(segments[0]?.toLowerCase() ?? '')) segments.shift();
  const dashboard = segments[0] ?? '';
  if (dashboard === 'vendor') return 'vendor';
  if (dashboard === 'admin' || dashboard === 'staff') return 'platform';
  return null;
}

/** A part of a path, decoded; as it is when it is not valid escaping (a stray `%`). */
function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** The path's parts and its query, from a path or a whole address. */
function parse(link: string): { segments: string[]; params: URLSearchParams } {
  const withoutOrigin = link.trim().replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i, '');
  const [path = '', query = ''] = withoutOrigin.split('#')[0]?.split('?') ?? [];
  return {
    segments: path.split('/').filter(Boolean).map(decode),
    params: new URLSearchParams(query),
  };
}

/**
 * An address on the store's website. `websiteUrl` ends with a slash and a link
 * starts with one, so putting them side by side would make a `//`.
 */
export function joinWebsiteUrl(website: string, path: string): string {
  return `${website.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
