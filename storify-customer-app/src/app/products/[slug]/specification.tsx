import { useLocalSearchParams } from 'expo-router';
import { useTranslations } from 'use-intl';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { DetailSheet } from '@/features/product/sheets/detail-sheet';
import { ProductSpecification } from '@/features/product/sheets/product-info';
import { useProduct } from '@/features/product/use-product';

/** The product's attributes, a sheet over its page. */
export default function SpecificationScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const t = useTranslations('reviews');
  const product = useProduct(slug);

  const body = () => {
    if (product.isPending) return <LoadingState />;
    if (product.isError) {
      return <ErrorState error={product.error} onRetry={() => void product.refetch()} />;
    }
    if (product.data.attributes.length === 0) {
      return <EmptyState icon="list" title={t('noSpecification')} />;
    }
    return <ProductSpecification attributes={product.data.attributes} />;
  };

  return (
    <DetailSheet slug={slug} title={t('specificationTitle')}>
      {body()}
    </DetailSheet>
  );
}
