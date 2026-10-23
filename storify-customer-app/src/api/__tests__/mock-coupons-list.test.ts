import { CouponList } from '@/contracts/mobile/shop/v1';

import { resetMockServer } from '../mocks/server';
import { dataOf } from './mock-helpers';

beforeEach(resetMockServer);

describe('coupons list', () => {
  it('lists usable and unusable codes, usable first, each unusable one with its reason', async () => {
    const list = await dataOf(CouponList, '/coupons');

    expect(list.items.some((item) => item.usable)).toBe(true);
    expect(list.items.some((item) => !item.usable)).toBe(true);
    const firstUnusable = list.items.findIndex((item) => !item.usable);
    expect(list.items.slice(firstUnusable).every((item) => !item.usable)).toBe(true);
    for (const item of list.items.filter((entry) => !entry.usable)) {
      expect(item.reasonMessage).toBeTruthy();
    }
  });
});
