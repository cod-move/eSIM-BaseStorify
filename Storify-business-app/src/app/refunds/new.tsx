import { useLocalSearchParams } from 'expo-router';
import { RefundScreen } from '@/features/returns/refund-screen';
export default function NewRefund() {
  const { targetId = '', kind = 'order' } = useLocalSearchParams<{
    targetId?: string;
    kind?: string;
  }>();
  return <RefundScreen target={{ kind: kind === 'return' ? 'return' : 'order', id: targetId }} />;
}
