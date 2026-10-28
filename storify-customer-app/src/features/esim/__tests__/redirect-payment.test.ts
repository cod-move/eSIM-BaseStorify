import { isRedirectMethod, resultOf } from '../redirect-payment';

jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));

const pending = { method: 'extension' as const, reference: 'ref-1' };

describe('a payment on a gateway page', () => {
  it('knows the redirect methods, the eSIM payment page among them', () => {
    expect(isRedirectMethod('paypal')).toBe(true);
    expect(isRedirectMethod('extension')).toBe(true);
    expect(isRedirectMethod('card')).toBe(false);
    expect(isRedirectMethod('cod')).toBe(false);
  });

  it('turns the store answer into the outcome screen', () => {
    expect(resultOf({ status: 'PAID', orderId: 'o1', orderNumber: 'ORD1' }, pending)).toEqual({
      outcome: 'paid',
      orderId: 'o1',
      orderNumber: 'ORD1',
    });
    expect(resultOf({ status: 'PENDING' }, pending)).toEqual({
      outcome: 'redirect-pending',
      ...pending,
    });
    expect(resultOf({ status: 'PAID' }, pending)).toEqual({
      outcome: 'redirect-pending',
      ...pending,
    });
    expect(resultOf({ status: 'FAILED', reason: 'DECLINED' }, pending)).toEqual({
      outcome: 'failed',
      reason: 'notPaid',
    });
    expect(
      resultOf({ status: 'CANCELLED', reason: 'CHECKOUT_CLOSED', refunded: true }, pending)
    ).toEqual({ outcome: 'failed', reason: 'returned' });
  });

  it('a shopper who gave up at the gateway goes back to checkout, with no error', () => {
    expect(resultOf({ status: 'CANCELLED', reason: 'PAYER_CANCELLED' }, pending)).toBeNull();
  });
});
