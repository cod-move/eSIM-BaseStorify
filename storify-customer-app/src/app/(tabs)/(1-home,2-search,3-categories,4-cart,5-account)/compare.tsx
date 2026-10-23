import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslations } from 'use-intl';

import { HeaderTitle } from '@/components/shell/app-header';
import { CompareView } from '@/features/compare/compare-view';

/**
 * `/compare`: products side by side, as on the website. `?products=a,b` names
 * them, as the website's address does; without it the screen shows what the
 * shopper picked on the product pages.
 */
export default function CompareScreen() {
  const t = useTranslations('compare');
  const { products } = useLocalSearchParams<{ products?: string | string[] }>();
  const linked = Array.isArray(products) ? products.join(',') : products;

  return (
    <>
      <Stack.Screen
        options={{ headerTitle: () => <HeaderTitle icon="scale" title={t('title')} /> }}
      />
      <CompareView linked={linked || undefined} />
    </>
  );
}
