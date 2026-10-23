import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslations } from 'use-intl';

import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { ReturnDetailView } from '@/features/returns/return-detail';
import { useMyReturn } from '@/features/returns/use-returns';

/** One return. Its title is the return's number once it has arrived. */
export default function ReturnScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations('returns');
  const item = useMyReturn(id);

  const body = () => {
    if (item.isPending) return <LoadingState />;
    if (item.isError) {
      return <ErrorState error={item.error} onRetry={() => void item.refetch()} />;
    }
    return <ReturnDetailView item={item.data} />;
  };

  return (
    <>
      <Stack.Screen
        options={{ title: item.data ? t('number', { number: item.data.number }) : '' }}
      />
      {body()}
    </>
  );
}
