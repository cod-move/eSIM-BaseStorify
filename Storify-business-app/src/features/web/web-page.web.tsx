import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/state-view';

import type { WebPageProps } from './web-page.types';

/**
 * The browser preview's stand-in for the in-app page. A browser cannot frame
 * the store's pages (they forbid it), so the page opens in a tab of its own.
 */
export function WebPage({ url }: WebPageProps) {
  const t = useTranslations('web');

  return (
    <EmptyState
      icon="globe"
      title={t('browserTitle')}
      body={t('browserBody')}
      action={<Button label={t('open')} onPress={() => window.open(url, '_blank', 'noopener')} />}
    />
  );
}
