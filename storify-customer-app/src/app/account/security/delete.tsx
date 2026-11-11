import { Redirect } from 'expo-router';

import { DeleteAccountSheet } from '@/features/account/delete-account-form';
import { APP_FEATURES } from '@/features/esim/app-flags'; // [esim-patch] P52

/** Delete Account, a sheet over Security. */
export default function DeleteAccountScreen() {
  // [esim-patch] P52 deleting the account is hidden: back to the account.
  if (!APP_FEATURES.accountDeletion) return <Redirect href="/account" />;
  return <DeleteAccountSheet />;
}
