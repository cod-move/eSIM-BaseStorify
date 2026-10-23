import { useLocalSearchParams } from 'expo-router';
import { useTranslations } from 'use-intl';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { DetailSheet } from '@/features/product/sheets/detail-sheet';
import { ProductDescription } from '@/features/product/sheets/product-info';
import { useProduct } from '@/features/product/use-product';

/** The product's description, a sheet over its page. */
export default function DescriptionScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const t = useTranslations('reviews');
  const product = useProduct(slug);

  const body = () => {
    if (product.isPending) return <LoadingState />;
    if (product.isError) {
      return <ErrorState error={product.error} onRetry={() => void product.refetch()} />;
    }
    if (!product.data.descriptionHtml) {
      return <EmptyState icon="list" title={t('noDescription')} />;
    }
    return <ProductDescription name={product.data.name} html={product.data.descriptionHtml} />;
  };

  return (
    <DetailSheet slug={slug} title={t('descriptionTitle')}>
      {body()}
    </DetailSheet>
  );
}
