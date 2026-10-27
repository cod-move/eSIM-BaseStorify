import { DestinationScreen } from '@/features/esim/destination-screen';

/** The global plan (APP-02): the website's /esim/global. */
export default function EsimGlobalScreen() {
  return <DestinationScreen scope="multi" slug="global" />;
}
