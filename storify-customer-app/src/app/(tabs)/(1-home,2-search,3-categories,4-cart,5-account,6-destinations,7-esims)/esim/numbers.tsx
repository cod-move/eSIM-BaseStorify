import { Stack } from 'expo-router';
import { useTranslations } from 'use-intl';

import { NumberShopView } from '@/features/esim/number-shop-view';

/** The numbers page (the eSIM module, NUM-03): the website's /esim/numbers. */
export default function EsimNumbersScreen() {
  const t = useTranslations('esim.numbers');

  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <NumberShopView />
    </>
  );
}
