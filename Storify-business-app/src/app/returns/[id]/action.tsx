import { useLocalSearchParams } from 'expo-router';
import { ReturnActionScreen } from '@/features/returns/return-action-screen';
export default function ReturnAction() {
  const { id, action = '' } = useLocalSearchParams<{ id: string; action?: string }>();
  return <ReturnActionScreen id={id} action={action} />;
}
