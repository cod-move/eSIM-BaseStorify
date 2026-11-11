import { useLocalSearchParams } from 'expo-router';

import { DestinationScreen } from '@/features/esim/destination-screen';

/** A country's plans (APP-02): the website's /esim/{country}. */
export default function EsimCountryScreen() {
  const { country } = useLocalSearchParams<{ country: string }>();
  return <DestinationScreen scope="local" slug={country} />;
}
