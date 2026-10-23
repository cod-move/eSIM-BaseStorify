import { notificationTarget } from '@/lib/links';

import { targetRoute } from '../notification-routes';

const route = (link: string, type?: string) => {
  const target = notificationTarget(link, type);
  return target ? targetRoute(target) : null;
};

describe('the screen a notification opens', () => {
  it('opens the order, the thread, the application and the payout it names', () => {
    expect(route('/en/admin/orders/ord_1')).toEqual({
      href: { pathname: '/orders/[id]', params: { id: 'ord_1' } },
      capability: 'VIEW_ORDERS',
    });
    expect(route('/vendor/inbox?conversation=c1')).toMatchObject({
      href: { pathname: '/conversations/[id]', params: { id: 'c1' } },
      capability: 'VIEW_INBOX',
    });
    expect(route('/en/admin/vendors/v1')).toMatchObject({
      href: { pathname: '/applications/[id]', params: { id: 'v1' } },
      capability: 'REVIEW_VENDOR_APPLICATIONS',
    });
    expect(route('/en/vendor/payouts/p1')).toMatchObject({
      href: { pathname: '/payouts/[id]', params: { id: 'p1' } },
      capability: 'VIEW_PAYOUTS',
    });
  });

  it('opens the low-stock list for a low-stock alert, which names no product', () => {
    expect(route('/en/vendor/products', 'product_low_stock')).toEqual({
      href: { pathname: '/products', params: { lowStock: 'true' } },
      capability: 'VIEW_PRODUCTS',
    });
    expect(route('/en/vendor/products')).toEqual({
      href: '/products',
      capability: 'VIEW_PRODUCTS',
    });
  });

  it("opens a product's stock for the store's low-stock alert, which names the product", () => {
    expect(route('/en/admin/products/p1/edit', 'product_low_stock')).toEqual({
      href: { pathname: '/products/[id]/stock', params: { id: 'p1' } },
      capability: 'VIEW_STOCK',
    });
    expect(route('/staff/products/p1/edit', 'product_low_stock')).toMatchObject({
      capability: 'VIEW_STOCK',
    });
    // Without a product, the staff's stock page: the low-stock list.
    expect(route('/en/staff/inventory', 'product_low_stock')).toEqual({
      href: { pathname: '/products', params: { lowStock: 'true' } },
      capability: 'VIEW_PRODUCTS',
    });
    // Another notification about a product's editor opens the product.
    expect(route('/en/admin/products/p1/edit')).toMatchObject({
      href: { pathname: '/products/[id]', params: { id: 'p1' } },
    });
    expect(route('/en/admin/products/p1/variants')).toBeNull();
  });

  it('opens the payouts list, which lives under the Account tab', () => {
    expect(route('/en/vendor/payouts')).toEqual({
      href: '/more/payouts',
      capability: 'VIEW_PAYOUTS',
    });
  });
});
