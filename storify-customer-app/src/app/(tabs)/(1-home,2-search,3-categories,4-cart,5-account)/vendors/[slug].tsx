import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslations } from 'use-intl';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { isNotFound, useVendor } from '@/features/search/use-search';
import { SharePageButton } from '@/features/vendors/share-page-button';
import { VendorPage } from '@/features/vendors/vendor-page';

/**
 * A vendor's page, as on the website: `/vendors/{slug}`. Its cover and facts,
 * its categories, then its products.
 */
export default function VendorScreen() {
  const t = useTranslations('search');
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const vendor = useVendor(slug);
  const shown = vendor.data;

  return (
    <>
      <Stack.Screen
        options={{
          title: shown?.name ?? '',
          headerRight: shown
            ? () => (
                <SharePageButton
                  path={`/vendors/${encodeURIComponent(shown.slug)}`}
                  title={shown.name}
                />
              )
            : undefined,
        }}
      />
      {vendor.isPending ? (
        <LoadingState />
      ) : vendor.isError ? (
        isNotFound(vendor.error) ? (
          <EmptyState icon="search" title={t('notFoundTitle')} body={t('notFoundBody')} />
        ) : (
          <ErrorState error={vendor.error} onRetry={() => void vendor.refetch()} />
        )
      ) : (
        <VendorPage vendor={vendor.data} />
      )}
    </>
  );
}
