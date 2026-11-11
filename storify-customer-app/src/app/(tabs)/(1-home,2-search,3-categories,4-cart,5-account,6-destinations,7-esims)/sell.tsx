import { Stack } from 'expo-router';
import { useTranslations } from 'use-intl';

import { HeaderTitle } from '@/components/shell/app-header';
import { BusinessApp } from '@/features/vendor-app/business-app';

/** `/sell`: "Become a vendor", in the Storify Business app. */
export default function SellScreen() {
  const t = useTranslations('businessApp');

  return (
    <>
      <Stack.Screen
        options={{ headerTitle: () => <HeaderTitle icon="store" title={t('header')} /> }}
      />
      <BusinessApp />
    </>
  );
}
