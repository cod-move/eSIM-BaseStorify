import { useLocalSearchParams } from 'expo-router';

import { StockScreen } from '@/features/products/stock-screen';

export default function Stock() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <StockScreen id={id} />;
}
