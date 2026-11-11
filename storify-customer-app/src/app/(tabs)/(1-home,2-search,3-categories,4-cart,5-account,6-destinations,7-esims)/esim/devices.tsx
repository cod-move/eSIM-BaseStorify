import { Stack } from 'expo-router';
import { useTranslations } from 'use-intl';

import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { DeviceCheck } from '@/features/esim/device-check';
import { useEsimDevices } from '@/features/esim/use-destinations';

/** Does this phone take an eSIM (the eSIM module, APP-05). */
export default function EsimDevicesScreen() {
  const t = useTranslations('esim');
  const devices = useEsimDevices();

  const body = () => {
    if (devices.isPending) return <LoadingState />;
    if (devices.isError)
      return <ErrorState error={devices.error} onRetry={() => void devices.refetch()} />;
    return <DeviceCheck devices={devices.data} />;
  };

  return (
    <>
      <Stack.Screen options={{ title: t('devicesTitle') }} />
      {body()}
    </>
  );
}
