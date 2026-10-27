import { useLocalSearchParams } from 'expo-router';

import { DestinationScreen } from '@/features/esim/destination-screen';

/** A region's plans (APP-02): the website's /esim/region/{slug}. */
export default function EsimRegionScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <DestinationScreen scope="multi" slug={slug} />;
}
