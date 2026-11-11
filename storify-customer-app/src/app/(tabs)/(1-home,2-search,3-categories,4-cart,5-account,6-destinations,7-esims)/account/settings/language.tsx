import { Stack } from 'expo-router';
import { ScrollView } from 'react-native';
import { useTranslations } from 'use-intl';

import { HeaderTitle } from '@/components/shell/app-header';
import { useBottomSpace } from '@/components/shell/tab-bar';
import { LanguageList } from '@/features/account/settings';

/** `/account/settings/language`: the store's languages, for a guest as for a shopper. */
export default function LanguageScreen() {
  const t = useTranslations('settings');
  const bottom = useBottomSpace();

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-6 px-4 pt-4"
      contentContainerStyle={{ paddingBottom: bottom + 24 }}>
      <Stack.Screen
        options={{ headerTitle: () => <HeaderTitle icon="globe" title={t('language')} /> }}
      />
      <LanguageList />
    </ScrollView>
  );
}
