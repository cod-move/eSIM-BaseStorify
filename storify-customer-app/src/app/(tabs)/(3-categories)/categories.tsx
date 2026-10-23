import { Stack } from 'expo-router';
import { RefreshControl } from 'react-native';
import { useTranslations } from 'use-intl';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { CategoryGrid } from '@/features/categories/category-grid';
import { useCategories } from '@/features/categories/use-categories';
import { useRefresh } from '@/lib/use-refresh';

export default function CategoriesScreen() {
  const t = useTranslations('categories');
  const categories = useCategories();
  const { refreshing, onRefresh } = useRefresh(categories.refetch);

  return (
    <>
      <Stack.Screen options={{ headerTitle: t('title') }} />
      {categories.isPending ? (
        <LoadingState />
      ) : categories.isError ? (
        <ErrorState error={categories.error} onRetry={onRefresh} />
      ) : categories.data.length === 0 ? (
        <EmptyState icon="grid" title={t('emptyTitle')} body={t('emptyBody')} />
      ) : (
        <CategoryGrid
          categories={categories.data}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}
    </>
  );
}
