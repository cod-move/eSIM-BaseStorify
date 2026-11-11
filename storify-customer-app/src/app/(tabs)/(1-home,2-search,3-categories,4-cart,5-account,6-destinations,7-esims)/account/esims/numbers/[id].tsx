import { Stack, useLocalSearchParams } from 'expo-router';

import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { NumberDetailView } from '@/features/esim/number-detail';
import { useEsimNumber } from '@/features/esim/use-numbers';

/** One of the shopper's numbers (the eSIM module, NUM-06~09): the website's /account/esims/numbers/{id}. */
export default function EsimNumberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const number = useEsimNumber(id);

  const body = () => {
    if (number.isPending) return <LoadingState />;
    if (number.isError)
      return <ErrorState error={number.error} onRetry={() => void number.refetch()} />;
    return <NumberDetailView number={number.data} />;
  };

  return (
    <>
      <Stack.Screen options={{ title: number.data?.display ?? '' }} />
      {body()}
    </>
  );
}
