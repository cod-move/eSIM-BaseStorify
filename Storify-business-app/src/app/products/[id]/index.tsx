import { useLocalSearchParams } from 'expo-router';

import { ProductScreen } from '@/features/products/product-screen';

export default function Product() {
  const { id, code } = useLocalSearchParams<{ id: string; code?: string }>();
  return <ProductScreen id={id} code={code} />;
}
