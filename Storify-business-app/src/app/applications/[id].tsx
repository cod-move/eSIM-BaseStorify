import { useLocalSearchParams } from 'expo-router';

import { ApplicationScreen } from '@/features/more/application-screen';

export default function Application() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  return <ApplicationScreen id={id} />;
}
