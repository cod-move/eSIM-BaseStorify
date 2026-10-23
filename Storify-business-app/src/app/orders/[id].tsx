import { useLocalSearchParams } from 'expo-router';

import { OrderScreen } from '@/features/orders/order-screen';

/** One order, above the tabs (features/orders). Opened from the list, Home's tiles and a push. */
export default function Order() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <OrderScreen key={id} id={id} />;
}
