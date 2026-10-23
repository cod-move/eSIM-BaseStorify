import { useLocalSearchParams } from 'expo-router';

import { StockHistoryScreen } from '@/features/products/stock-history-screen';

export default function StockHistory() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <StockHistoryScreen id={id} />;
}
