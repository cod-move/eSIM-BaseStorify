import { Stack } from 'expo-router';
import { useTranslations } from 'use-intl';

import { TrackOrderView } from '@/features/guest-tracking/track-order-view';

/** Tracking an order without an account: its number and the email or phone it was placed with. */
export default function TrackOrderScreen() {
  const t = useTranslations('trackOrder');

  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <TrackOrderView />
    </>
  );
}
