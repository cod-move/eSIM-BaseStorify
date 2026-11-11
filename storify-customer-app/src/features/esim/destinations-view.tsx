import { Stack } from 'expo-router';
import { useTranslations } from 'use-intl';

import { ErrorState, LoadingState } from '@/components/ui/state-view';

import { DestinationBrowser } from './destination-browser';
import { useEsimDestinations } from './use-destinations';

/** Destinations (APP-02): the website's /esim, and the Destinations tab. */
export function DestinationsView() {
  const t = useTranslations('esim');
  const destinations = useEsimDestinations();

  const body = () => {
    if (destinations.isPending) return <LoadingState />;
    if (destinations.isError) {
      return <ErrorState error={destinations.error} onRetry={() => void destinations.refetch()} />;
    }
    return <DestinationBrowser destinations={destinations.data} />;
  };

  return (
    <>
      <Stack.Screen options={{ title: t('destinationsTitle') }} />
      {body()}
    </>
  );
}
