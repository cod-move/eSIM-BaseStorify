import { renderHook } from '@testing-library/react-native';

import { CAPABILITIES, useCapabilities, useCapability } from '@/features/config/use-capability';

describe('useCapability', () => {
  it('is on for the v1 features', async () => {
    const { result } = await renderHook(() => useCapability('checkout.stripe'));

    expect(result.current).toBe(true);
  });

  it('is off for the features of a later release', async () => {
    const { result } = await renderHook(() => useCapability('auth.apple'));

    expect(result.current).toBe(false);
  });

  it('is on for the v1 features and no others', () => {
    const on = Object.entries(CAPABILITIES)
      .filter(([, value]) => value)
      .map(([name]) => name);

    expect(on).toEqual([
      'checkout.stripe',
      'checkout.cashOnDelivery',
      'checkout.coupons',
      'orders.guestTracking',
      'orders.returns',
      'reviews.write',
      'reviews.mine',
      'support.chat',
    ]);
  });
});

describe('useCapabilities', () => {
  it('keeps what is on, and what names no capability', async () => {
    const { result } = await renderHook(() => useCapabilities());
    const items = [
      { id: 'pay' },
      { id: 'coupons', capability: 'checkout.coupons' as const },
      { id: 'apple', capability: 'auth.apple' as const },
    ];

    expect(items.filter((item) => result.current(item.capability)).map((item) => item.id)).toEqual([
      'pay',
      'coupons',
    ]);
  });
});
