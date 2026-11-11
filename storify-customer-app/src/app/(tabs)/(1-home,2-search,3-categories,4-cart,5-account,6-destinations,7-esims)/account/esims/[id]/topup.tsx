import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslations } from 'use-intl';

import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { TopupPicker } from '@/features/esim/topup-picker';
import { useEsimTopups } from '@/features/esim/use-esims';

/** Top up an eSIM (the eSIM module, APP-06): the website's /account/esims/{id}/topup. */
export default function EsimTopupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations('esim');
  const topups = useEsimTopups(id);

  const body = () => {
    if (topups.isPending) return <LoadingState />;
    if (topups.isError)
      return <ErrorState error={topups.error} onRetry={() => void topups.refetch()} />;
    return <TopupPicker esimId={id} topups={topups.data} onRetry={() => void topups.refetch()} />;
  };

  return (
    <>
      <Stack.Screen options={{ title: t('topupTitle') }} />
      {body()}
    </>
  );
}
