import { useLocalSearchParams } from 'expo-router';

import { CustomerProfileScreen } from '@/features/customers/customer-profile-screen';

export default function Customer() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  return <CustomerProfileScreen id={id} />;
}
