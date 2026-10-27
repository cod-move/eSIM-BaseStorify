import { Stack } from 'expo-router';
import { useTranslations } from 'use-intl';

import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { DestinationBrowser } from '@/features/esim/destination-browser';
import { useEsimDestinations } from '@/features/esim/use-destinations';

/** Destinations (the eSIM module, APP-02): the website's /esim. */
export default function EsimDestinationsScreen() {
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
