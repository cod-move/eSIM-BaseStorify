import { Stack } from 'expo-router';
import { useTranslations } from 'use-intl';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { HomeScreen } from '@/features/home/home-screen';
import { useHome } from '@/features/home/use-home';
import { useRefresh } from '@/lib/use-refresh';

/** Home draws its own header: the store's logo, the cart, and the search field. */
const SCREEN_OPTIONS = { headerShown: false };

/**
 * Home. The store sends a list of blocks; the screen draws them in order.
 *
 * A route file stays this thin: it reads its data through a feature's hook,
 * chooses between loading, error, empty and content, and hands the content to
 * the feature's components.
 */
export default function HomeRoute() {
  const t = useTranslations('home');
  const home = useHome();
  const { refreshing, onRefresh } = useRefresh(home.refetch);

  return (
    <>
      <Stack.Screen options={SCREEN_OPTIONS} />
      {home.isPending ? (
        <LoadingState />
      ) : home.isError ? (
        <ErrorState error={home.error} onRetry={onRefresh} />
      ) : home.data.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <HomeScreen blocks={home.data} refreshing={refreshing} onRefresh={onRefresh} />
      )}
    </>
  );
}
