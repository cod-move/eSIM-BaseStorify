import { useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { EsimList } from '@/features/esim/esim-list';
import { useEsims } from '@/features/esim/use-esims';

/** My eSIMs (the eSIM module, APP-03). */
export default function EsimsScreen() {
  const t = useTranslations('esim');
  const router = useRouter();
  const esims = useEsims();

  if (esims.isPending) return <LoadingState />;
  if (esims.isError) return <ErrorState error={esims.error} onRetry={() => void esims.refetch()} />;
  if (esims.data.length === 0) {
    return (
      <EmptyState
        icon="globe"
        title={t('emptyTitle')}
        body={t('emptyBody')}
        action={<Button label={t('browse')} onPress={() => router.push('/esim')} />}
      />
    );
  }
  return <EsimList esims={esims.data} />;
}
