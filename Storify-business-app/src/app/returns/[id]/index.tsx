import { useLocalSearchParams } from 'expo-router';
import { ReturnDetailScreen } from '@/features/returns/returns-screen';
export default function ReturnDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ReturnDetailScreen id={id} />;
}
