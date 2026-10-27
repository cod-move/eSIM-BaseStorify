import { Stack } from 'expo-router';

import { ErrorState, LoadingState } from '@/components/ui/state-view';

import { DestinationPlans } from './destination-plans';
import { useEsimDestination } from './use-destinations';

/** One destination's screen, for the three paths it may live at. */
export function DestinationScreen({ scope, slug }: { scope: 'local' | 'multi'; slug: string }) {
  const destination = useEsimDestination(scope, slug);

  const body = () => {
    if (destination.isPending) return <LoadingState />;
    if (destination.isError) {
      return <ErrorState error={destination.error} onRetry={() => void destination.refetch()} />;
    }
    return <DestinationPlans destination={destination.data} />;
  };

  return (
    <>
      <Stack.Screen options={{ title: destination.data?.name ?? '' }} />
      {body()}
    </>
  );
}
