import { isActiveOrder } from '../active-orders';

describe('isActiveOrder', () => {
  it('keeps the orders still on their way', () => {
    for (const status of ['pending', 'Processing', 'shipped', 'pre-order', 'out_for_delivery']) {
      expect(isActiveOrder({ status })).toBe(true);
    }
  });

  it('leaves out the delivered, cancelled and refunded ones', () => {
    for (const status of ['delivered', 'cancelled', 'canceled', 'Refunded']) {
      expect(isActiveOrder({ status })).toBe(false);
    }
  });
});
