import { joinWebsiteUrl, notificationTarget } from '../links';

describe('notificationTarget', () => {
  it('opens an order from any dashboard, with or without the language in front', () => {
    for (const link of [
      '/en/admin/orders/ord_1',
      '/vendor/orders/ord_1',
      '/bn/staff/orders/ord_1',
      'https://shop.example.com/ar/admin/orders/ord_1',
    ]) {
      expect(notificationTarget(link)).toEqual({ screen: 'order', id: 'ord_1' });
    }
    expect(notificationTarget('/en/staff/orders')).toEqual({ screen: 'orders' });
  });

  it('reads the thread from the conversation parameter', () => {
    expect(notificationTarget('/en/admin/inbox?view=chat&conversation=c1')).toEqual({
      screen: 'conversation',
      id: 'c1',
    });
    expect(notificationTarget('/vendor/inbox?conversation=c2')).toEqual({
      screen: 'conversation',
      id: 'c2',
    });
    expect(notificationTarget('/en/staff/inbox')).toEqual({ screen: 'inbox' });
  });

  it('opens the low-stock list for a low-stock alert, whose link names no product', () => {
    expect(notificationTarget('/en/vendor/products', 'product_low_stock')).toEqual({
      screen: 'products',
      lowStock: true,
    });
    expect(notificationTarget('/en/vendor/products')).toEqual({
      screen: 'products',
      lowStock: false,
    });
  });

  it("opens an application for administrators, and a seller's payouts", () => {
    expect(notificationTarget('/en/admin/vendors/vendor_1')).toEqual({
      screen: 'application',
      id: 'vendor_1',
    });
    expect(notificationTarget('/en/vendor/payouts/p1')).toEqual({ screen: 'payout', id: 'p1' });
    expect(notificationTarget('/en/vendor/payouts')).toEqual({ screen: 'payouts' });
    expect(notificationTarget('/en/vendor/vendors/vendor_1')).toBeNull();
  });

  it('leaves a page the app has no screen for to the browser', () => {
    expect(notificationTarget('/en/admin/returns')).toEqual({ screen: 'returns' });
    expect(notificationTarget('/en/vendor/dashboard')).toBeNull();
    expect(notificationTarget('/en/account/orders/1')).toBeNull();
    expect(notificationTarget('/en/admin/orders/ord_1/invoice')).toBeNull();
  });
});

describe('joinWebsiteUrl', () => {
  it('joins without a double slash', () => {
    expect(joinWebsiteUrl('https://shop.example.com/', '/en/admin/returns')).toBe(
      'https://shop.example.com/en/admin/returns'
    );
  });
});

describe('a link with broken escaping', () => {
  it('is read as written instead of throwing: the push still opens what it names', () => {
    expect(notificationTarget('/en/admin/orders/100%')).toEqual({ screen: 'order', id: '100%' });
    expect(notificationTarget('/vendor/orders/ord_%E0%A4')).toEqual({
      screen: 'order',
      id: 'ord_%E0%A4',
    });
    expect(notificationTarget('/en/admin/orders/ord%5F1')).toEqual({
      screen: 'order',
      id: 'ord_1',
    });
  });
});
