import { useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { useSession } from '@/features/auth/use-session';

import { DESTINATIONS_TAB } from './destination-path';
import { EsimList } from './esim-list';
import { useEsims } from './use-esims';
import { useEsimNumbers } from './use-numbers';

/** My eSIMs (APP-03): the account's screen and the My eSIMs tab. */
export function MyEsimsView() {
  const t = useTranslations('esim');
  const router = useRouter();
  const esims = useEsims();
  const numbers = useEsimNumbers();

  if (esims.isPending || numbers.isPending) return <LoadingState />;
  if (esims.isError) return <ErrorState error={esims.error} onRetry={() => void esims.refetch()} />;
  // The numbers are a second list: if they fail to load, the eSIMs still show.
  const mine = numbers.data ?? [];
  if (esims.data.length === 0 && mine.length === 0) {
    return (
      <EmptyState
        icon="globe"
        title={t('emptyTitle')}
        body={t('emptyBody')}
        action={<Button label={t('browse')} onPress={() => router.push(DESTINATIONS_TAB)} />}
      />
    );
  }
  return <EsimList esims={esims.data} numbers={mine} />;
}

/** The My eSIMs tab: a guest is asked to sign in first. */
export function MyEsimsTab() {
  const t = useTranslations('esim');
  const router = useRouter();
  const { user, isPending } = useSession();

  if (isPending) return <LoadingState />;
  if (!user) {
    return (
      <EmptyState
        icon="lock"
        title={t('signInTitle')}
        body={t('signInBody')}
        action={<Button label={t('signIn')} onPress={() => router.push('/login')} />}
      />
    );
  }
  return <MyEsimsView />;
}
