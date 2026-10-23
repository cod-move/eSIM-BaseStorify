import { useLocalSearchParams } from 'expo-router';

import { CustomerOrdersScreen } from '@/features/customers/customer-orders-screen';

export default function CustomerOrders() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  return <CustomerOrdersScreen id={id} />;
}
