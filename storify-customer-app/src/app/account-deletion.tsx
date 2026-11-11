import { Redirect, Stack } from 'expo-router';
import { useTranslations } from 'use-intl';

import { AccountDeletionView } from '@/features/account/account-deletion-view';
import { useSession } from '@/features/auth/use-session';
import { APP_FEATURES } from '@/features/esim/app-flags'; // [esim-patch] P52

/**
 * `/account-deletion`: how to delete an account, as on the website. A signed-in
 * shopper goes straight to the delete-account screen; a guest reads how, and can
 * sign in from here (signing in brings them back, and on to the delete screen).
 */
export default function AccountDeletionScreen() {
  const t = useTranslations('accountDeletion');
  const { isSignedIn } = useSession();

  // [esim-patch] P52 deleting the account is hidden: back to the account.
  if (!APP_FEATURES.accountDeletion) return <Redirect href="/account" />;
  if (isSignedIn) return <Redirect href="/account/security/delete" />;

  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <AccountDeletionView />
    </>
  );
}
