import { useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';

import { NavRow, RowGroup } from '@/components/ui/rows';

/**
 * The eSIM module's rows on the Account tab, under the purchases (patch
 * P23): My eSIMs, the balance, inviting friends and identity verification.
 */
export function EsimAccountRow() {
  const t = useTranslations('esim');
  const router = useRouter();

  return (
    <RowGroup>
      <NavRow icon="globe" title={t('title')} onPress={() => router.push('/account/esims')} />
      <NavRow
        icon="wallet"
        title={t('balance')}
        onPress={() => router.push('/account/esims/balance')}
      />
      <NavRow
        icon="share"
        title={t('inviteFriends')}
        onPress={() => router.push('/account/esims/referrals')}
      />
      <NavRow
        icon="shield"
        title={t('kycTitle')}
        onPress={() => router.push('/account/esims/verification')}
      />
    </RowGroup>
  );
}
