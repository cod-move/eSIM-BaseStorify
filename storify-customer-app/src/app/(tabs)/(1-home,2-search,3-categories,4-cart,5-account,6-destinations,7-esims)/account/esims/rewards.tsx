import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslations } from 'use-intl';

import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { RewardsCentreView, type RewardsTab } from '@/features/esim/rewards-centre-view';
import { useEsimRewards } from '@/features/esim/use-account';

const TABS: RewardsTab[] = ['invite', 'checkin', 'received'];

/** The rewards centre (福利中心, the eSIM module): the website's /account/esims/rewards. Opens on inviting friends; `?tab=checkin|received`. */
export default function EsimRewardsScreen() {
  const t = useTranslations('esim');
  const rewards = useEsimRewards();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const initialTab = TABS.includes(tab as RewardsTab) ? (tab as RewardsTab) : 'invite';

  const body = () => {
    if (rewards.isPending) return <LoadingState />;
    if (rewards.isError)
      return <ErrorState error={rewards.error} onRetry={() => void rewards.refetch()} />;
    return <RewardsCentreView rewards={rewards.data} initialTab={initialTab} />;
  };

  return (
    <>
      <Stack.Screen options={{ title: t('rewardsCentre') }} />
      {body()}
    </>
  );
}
