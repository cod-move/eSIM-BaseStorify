import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Screen, StackHeader } from '@/components/ui/screen';
import { EmptyState } from '@/components/ui/state-view';
import { useConfig } from '@/features/config/use-config';

import { pageTitle, readPageUrl } from './page-params';
import { WebPage } from './web-page';

/**
 * A page of the web, inside the app (`/web?url=…&title=…`): the header with
 * the page's title, then the page. An address that is not http or https is
 * not opened.
 */
export function WebPageScreen({
  url: given,
  title,
}: {
  url: string | string[] | undefined;
  title: string | string[] | undefined;
}) {
  const t = useTranslations('web');
  const store = useConfig().data?.store;
  const url = readPageUrl(given);

  return (
    <Screen header={<StackHeader title={pageTitle(url, title, store)} />}>
      <View className="flex-1 pb-safe">
        {url ? <WebPage url={url} /> : <EmptyState icon="globe" title={t('missingTitle')} />}
      </View>
    </Screen>
  );
}
