import { Stack, useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/state-view';

/** Shown for a link the app has no screen for. */
export default function NotFoundScreen() {
  const t = useTranslations('notFound');
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: '' }} />
      <EmptyState
        title={t('title')}
        body={t('body')}
        icon="search"
        action={<Button label={t('home')} onPress={() => router.replace('/')} />}
      />
    </>
  );
}
