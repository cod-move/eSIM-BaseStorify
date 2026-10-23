import { useLocalSearchParams } from 'expo-router';

import { PayoutScreen } from '@/features/more/payout-screen';

export default function Payout() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  return <PayoutScreen id={id} />;
}
