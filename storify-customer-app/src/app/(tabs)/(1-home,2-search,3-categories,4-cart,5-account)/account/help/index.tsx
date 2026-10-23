import { Stack } from 'expo-router';
import { useTranslations } from 'use-intl';

import { HeaderTitle } from '@/components/shell/app-header';
import { HelpCenter } from '@/features/help/help-center';

/** `/account/help`: ways to reach the store and the common questions, for guests and shoppers. */
export default function HelpScreen() {
  const t = useTranslations('help');

  return (
    <>
      <Stack.Screen
        options={{ headerTitle: () => <HeaderTitle icon="help" title={t('header')} /> }}
      />
      <HelpCenter />
    </>
  );
}
