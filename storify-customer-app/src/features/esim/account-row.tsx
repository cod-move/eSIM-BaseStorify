import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { NavRow, RowGroup } from '@/components/ui/rows';
import { Text } from '@/components/ui/text';

/**
 * The eSIM module's rows on the Account tab (patch P23), and the titled
 * groups the tab's menus are sorted into: eSIM, wallet & rewards, account &
 * security, the app, and the store's policies.
 */

/** A titled group of rows. */
export function MenuGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text variant="label" className="px-1 text-muted">
        {title}
      </Text>
      <RowGroup>{children}</RowGroup>
    </View>
  );
}

/** The groups' titles. */
export function useMenuGroupTitles() {
  const t = useTranslations('esim');
  return {
    esim: t('menuEsim'),
    wallet: t('menuWallet'),
    account: t('menuAccount'),
    app: t('menuApp'),
    policies: t('menuPolicies'),
  };
}

/**
 * The eSIM module's rows, each on its own so the tab can put it in its group.
 * Rows, not components: `RowGroup` draws a line before every element it gets.
 */
export function useEsimAccountRows() {
  const t = useTranslations('esim');
  const router = useRouter();
  return {
    esims: (
      <NavRow
        key="esims"
        icon="sim"
        title={t('title')}
        onPress={() => router.push('/account/esims')}
      />
    ),
    balance: (
      <NavRow
        key="balance"
        icon="wallet"
        title={t('balance')}
        onPress={() => router.push('/account/esims/balance')}
      />
    ),
    rewards: (
      <NavRow
        key="rewards"
        icon="star"
        title={t('rewardsCentre')}
        onPress={() => router.push('/account/esims/rewards')}
      />
    ),
    invite: (
      <NavRow
        key="invite"
        icon="share"
        title={t('inviteFriends')}
        onPress={() => router.push('/account/esims/referrals')}
      />
    ),
    verification: (
      <NavRow
        key="verification"
        icon="check-circle"
        title={t('kycTitle')}
        onPress={() => router.push('/account/esims/verification')}
      />
    ),
  };
}
