import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslations } from 'use-intl';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { productsHref } from '@/features/categories/category-href';
import { CategoryDetail } from '@/features/categories/category-detail';
import { useCategory } from '@/features/categories/use-categories';

/**
 * A category with sub-categories, as on the website: `/categories/mobile-phones`.
 * One without any goes straight to its products.
 */
export default function CategoryScreen() {
  const t = useTranslations('categories');
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const category = useCategory(slug);

  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      {category.isPending ? (
        <LoadingState />
      ) : category.isError ? (
        <ErrorState error={category.error} onRetry={() => void category.refetch()} />
      ) : !category.data ? (
        <EmptyState icon="grid" title={t('notFoundTitle')} body={t('notFoundBody')} />
      ) : category.data.children.length === 0 ? (
        <Redirect href={productsHref(category.data)} />
      ) : (
        <CategoryDetail category={category.data} />
      )}
    </>
  );
}
