import { useLocalSearchParams } from 'expo-router';

import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { ProductPage } from '@/features/product/product-page';
import { useProduct } from '@/features/product/use-product';

/**
 * The product page. The product is public, the same for everybody, so it is
 * cached; the shopper's own part (the heart) is asked separately, and only
 * when somebody is signed in.
 */
export default function ProductScreen() {
  const { slug } = useLocalSearchParams<'/products/[slug]'>();
  const product = useProduct(slug);

  if (product.isPending) return <LoadingState />;
  if (product.isError) {
    return <ErrorState error={product.error} onRetry={() => void product.refetch()} />;
  }
  return <ProductPage product={product.data} />;
}
