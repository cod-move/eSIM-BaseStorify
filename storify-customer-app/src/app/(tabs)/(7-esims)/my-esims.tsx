import { Stack } from 'expo-router';
import { useTranslations } from 'use-intl';

import { MyEsimsTab } from '@/features/esim/my-esims-view';

/** The My eSIMs tab (the eSIM module, patch P49). */
export default function MyEsimsTabScreen() {
  const t = useTranslations('esim');
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <MyEsimsTab />
    </>
  );
}
