import { useLocalSearchParams } from 'expo-router';
import { RefundReceiptScreen } from '@/features/returns/refund-screen';
export default function RefundReceipt() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RefundReceiptScreen id={id} />;
}
