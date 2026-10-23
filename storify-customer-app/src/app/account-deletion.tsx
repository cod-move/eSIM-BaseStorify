import { Redirect, Stack } from 'expo-router';
import { useTranslations } from 'use-intl';

import { AccountDeletionView } from '@/features/account/account-deletion-view';
import { useSession } from '@/features/auth/use-session';

/**
 * `/account-deletion`: how to delete an account, as on the website. A signed-in
 * shopper goes straight to the delete-account screen; a guest reads how, and can
 * sign in from here (signing in brings them back, and on to the delete screen).
 */
export default function AccountDeletionScreen() {
  const t = useTranslations('accountDeletion');
  const { isSignedIn } = useSession();

  if (isSignedIn) return <Redirect href="/account/security/delete" />;

  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <AccountDeletionView />
    </>
  );
}
