import { useLocalSearchParams } from 'expo-router';

import { CustomerEmailScreen } from '@/features/esim/customer-email-screen';

export default function CustomerEmail() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  return <CustomerEmailScreen id={id} />;
}
