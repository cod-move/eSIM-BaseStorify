import { router } from 'expo-router';

import { checkoutRefOf, endPayInApp, payInApp, payInAppWaiting } from '../crypto-pay-session';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const REF = 'ext0123456789abcdef01234567';

describe('the app’s own payment screen', () => {
  it('reads the checkout from the eSIM payment page’s address', () => {
    expect(checkoutRefOf(`https://shop.test/zh/esim/pay/${REF}?app=1`)).toBe(REF);
    expect(checkoutRefOf(`https://shop.test/esim/pay/${REF}`)).toBe(REF);
    expect(checkoutRefOf('https://shop.test/esim/pay/extnothex?app=1')).toBeNull();
    expect(checkoutRefOf('https://www.paypal.com/checkout?token=1')).toBeNull();
  });

  it('opens the screen and waits until it ends; only the first end counts', async () => {
    const waiting = payInApp(REF);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/checkout/esim-pay',
      params: { ref: REF },
    });
    expect(payInAppWaiting()).toBe(true);
    endPayInApp({ kind: 'page', method: 'stripe' });
    endPayInApp({ kind: 'done', paying: true });
    await expect(waiting).resolves.toEqual({ kind: 'page', method: 'stripe' });
    expect(payInAppWaiting()).toBe(false);
  });
});
