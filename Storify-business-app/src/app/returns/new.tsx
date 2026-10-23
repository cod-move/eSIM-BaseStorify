import { useLocalSearchParams } from 'expo-router';
import { ReturnCreateScreen } from '@/features/returns/return-create-screen';
export default function NewReturn() {
  const { orderId = '' } = useLocalSearchParams<{ orderId?: string }>();
  return <ReturnCreateScreen orderId={orderId} />;
}
