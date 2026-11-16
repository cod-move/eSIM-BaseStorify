import { useLocalSearchParams } from 'expo-router';

import { EsimDetailScreen } from '@/features/esim/esim-detail-screen';

export default function Esim() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  return <EsimDetailScreen id={id} />;
}
