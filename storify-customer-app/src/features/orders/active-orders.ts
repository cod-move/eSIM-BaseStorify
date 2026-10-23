import { describeStatus } from '@/components/ui/badge';
import type { OrderSummary } from '@/contracts/mobile/shop/v1';

/**
 * Whether an order is still on its way: anything but delivered, cancelled or
 * refunded. A status the app does not know counts as on its way: the store
 * may name its own steps ("out for delivery"), and a finished order it
 * describes in words of its own still shows in the history.
 */
export function isActiveOrder(order: Pick<OrderSummary, 'status'>): boolean {
  const { tone } = describeStatus(order.status);
  return tone !== 'done' && tone !== 'stopped';
}
