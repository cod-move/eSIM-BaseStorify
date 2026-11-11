import { Stack } from 'expo-router';
import { useTranslations } from 'use-intl';

import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { ReferralsView } from '@/features/esim/referrals-view';
import { useEsimReferrals } from '@/features/esim/use-account';

/** Invite friends (the eSIM module, APP-07): the website's /account/esims/referrals. */
export default function EsimReferralsScreen() {
  const t = useTranslations('esim');
  const centre = useEsimReferrals();

  const body = () => {
    if (centre.isPending) return <LoadingState />;
    if (centre.isError)
      return <ErrorState error={centre.error} onRetry={() => void centre.refetch()} />;
    return <ReferralsView centre={centre.data} />;
  };

  return (
    <>
      <Stack.Screen options={{ title: t('inviteFriends') }} />
      {body()}
    </>
  );
}
