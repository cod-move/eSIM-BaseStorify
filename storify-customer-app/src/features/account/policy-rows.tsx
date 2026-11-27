import { useTranslations } from 'use-intl';

import { View } from 'react-native'; // [esim-patch] P23
import { NavRow, RowGroup } from '@/components/ui/rows';
import { Text } from '@/components/ui/text'; // [esim-patch] P23
import { useConfig } from '@/features/config/use-config';
import { useOpenLink } from '@/features/config/use-open-link';
import { APP_FEATURES } from '@/features/esim/app-flags'; // [esim-patch] P52

/**
 * The store's privacy policy, terms and account deletion page, as rows on the
 * Account tab for guests and shoppers. A row appears only when the store
 * published that page's address; a tap opens the page as the app's own screen
 * (`/privacy`, `/terms`, `/account-deletion`).
 */
export function PolicyRows({ title }: { title?: string } = {}) {
  const t = useTranslations('policies');
  const pages = useConfig().data?.pages;
  const openLink = useOpenLink();

  const rows = [
    { key: 'privacy', icon: 'lock', title: t('privacy'), url: pages?.privacyPolicyUrl },
    { key: 'terms', icon: 'list', title: t('terms'), url: pages?.termsUrl },
    // Always published: opens the app's own screen (`/account-deletion`).
    { key: 'deletion', icon: 'trash', title: t('accountDeletion'), url: pages?.accountDeletionUrl },
  ] as const;

  // [esim-patch] P52 the deletion row stays hidden while the app offers no account deletion.
  const listed = rows.filter(
    (row) => row.url && (row.key !== 'deletion' || APP_FEATURES.accountDeletion)
  );
  if (listed.length === 0) return null;

  const group = (
    <RowGroup>
      {listed.map(({ key, icon, title: name, url }) => (
        <NavRow key={key} icon={icon} title={name} onPress={() => openLink(url ?? '')} />
      ))}
    </RowGroup>
  );
  // [esim-patch] P23 under a title, among the Account tab's titled groups.
  return title ? (
    <View className="gap-2">
      <Text variant="label" className="px-1 text-muted">
        {title}
      </Text>
      {group}
    </View>
  ) : (
    group
  );
}
