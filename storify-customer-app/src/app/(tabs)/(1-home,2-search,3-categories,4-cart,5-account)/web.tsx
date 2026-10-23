import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { HeaderTitle } from '@/components/shell/app-header';
import { useBottomSpace } from '@/components/shell/tab-bar';
import { EmptyState } from '@/components/ui/state-view';
import { WebPage } from '@/features/web/web-page';
import { pageTitle, readPageUrl } from '@/features/web/page-params';

/** `/web?url=…&title=…`: a page of the store's website, inside the app. */
export default function WebPageScreen() {
  const t = useTranslations('web');
  const params = useLocalSearchParams<{ url?: string; title?: string }>();
  const bottom = useBottomSpace();
  const url = readPageUrl(params.url);

  return (
    <View className="flex-1 bg-background" style={{ paddingBottom: bottom }}>
      <Stack.Screen
        options={{
          headerTitle: () => <HeaderTitle icon="globe" title={pageTitle(url, params.title)} />,
        }}
      />
      {url ? <WebPage url={url} /> : <EmptyState icon="globe" title={t('missingTitle')} />}
    </View>
  );
}
