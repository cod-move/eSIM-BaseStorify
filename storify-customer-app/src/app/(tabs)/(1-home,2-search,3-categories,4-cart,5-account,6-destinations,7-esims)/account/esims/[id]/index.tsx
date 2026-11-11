import { Stack, useLocalSearchParams } from 'expo-router';

import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { EsimDetailView } from '@/features/esim/esim-detail';
import { useEsim } from '@/features/esim/use-esims';

/** One eSIM (the eSIM module, APP-03/04). Its title is the plan's once it has arrived. */
export default function EsimScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const esim = useEsim(id);

  const body = () => {
    if (esim.isPending) return <LoadingState />;
    if (esim.isError) return <ErrorState error={esim.error} onRetry={() => void esim.refetch()} />;
    return <EsimDetailView esim={esim.data} />;
  };

  return (
    <>
      <Stack.Screen options={{ title: esim.data?.destination ?? '' }} />
      {body()}
    </>
  );
}
