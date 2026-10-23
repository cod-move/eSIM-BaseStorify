import { useTranslations } from 'use-intl';

import { NavRow, RowGroup } from '@/components/ui/rows';
import { useConfig } from '@/features/config/use-config';
import { useOpenLink } from '@/features/config/use-open-link';

/**
 * The store's privacy policy, terms and account deletion page, as rows on the
 * Account tab for guests and shoppers. A row appears only when the store
 * published that page's address; a tap opens the page as the app's own screen
 * (`/privacy`, `/terms`, `/account-deletion`).
 */
export function PolicyRows() {
  const t = useTranslations('policies');
  const pages = useConfig().data?.pages;
  const openLink = useOpenLink();

  const rows = [
    { key: 'privacy', icon: 'lock', title: t('privacy'), url: pages?.privacyPolicyUrl },
    { key: 'terms', icon: 'list', title: t('terms'), url: pages?.termsUrl },
    // Always published: opens the app's own screen (`/account-deletion`).
    { key: 'deletion', icon: 'trash', title: t('accountDeletion'), url: pages?.accountDeletionUrl },
  ] as const;

  const listed = rows.filter((row) => row.url);
  if (listed.length === 0) return null;

  return (
    <RowGroup>
      {listed.map(({ key, icon, title, url }) => (
        <NavRow key={key} icon={icon} title={title} onPress={() => openLink(url ?? '')} />
      ))}
    </RowGroup>
  );
}
