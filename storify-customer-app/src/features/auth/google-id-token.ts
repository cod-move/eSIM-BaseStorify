import { Platform } from 'react-native';
import {
  GoogleOneTapSignIn,
  isCancelledResponse,
  isErrorWithCode,
  isNoSavedCredentialFoundResponse,
  isSuccessResponse,
  statusCodes,
} from 'react-native-nitro-google-signin';

import { env } from '@/config/env';

/**
 * Asking the phone's Google SDK who the shopper is: Credential Manager on
 * Android, Google Sign-In on iOS. The answer is an ID token for the store to
 * check, never a session: the session is the store's, from `useSignIn`.
 *
 * The SDK is given the store's web client ID (`GET /config`, `auth.google`).
 * On both platforms that makes it the token's audience, which is the one the
 * store accepts. iOS also needs the app's own iOS client, from the build
 * (`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, whose URL scheme app.config.ts
 * registers); Android finds its client by the app's package and signature.
 */

export type GoogleIdToken =
  | { type: 'token'; token: string; email: string | null }
  /** The shopper closed the picker. Not an error: nothing is shown. */
  | { type: 'cancelled' }
  /** The phone has no Google account to offer. */
  | { type: 'noAccount' }
  /** The SDK failed: no Play services, a misconfigured client, no connection to Google. */
  | { type: 'failed' };

/** Whether this build can sign in with Google at all: iOS needs its client ID compiled in. */
export function canUseGoogleSignIn(): boolean {
  if (Platform.OS === 'android') return true;
  if (Platform.OS === 'ios') return env.googleIosClientId !== null;
  return false;
}

export async function requestGoogleIdToken(webClientId: string): Promise<GoogleIdToken> {
  try {
    GoogleOneTapSignIn.configure({ webClientId, iosClientId: env.googleIosClientId });
    await GoogleOneTapSignIn.checkPlayServices();
    // The "Sign in with Google" flow a button opens: every account on the
    // phone, not only one used before.
    const response = await GoogleOneTapSignIn.presentExplicitSignIn();

    if (isCancelledResponse(response)) return { type: 'cancelled' };
    if (isNoSavedCredentialFoundResponse(response)) return { type: 'noAccount' };
    if (!isSuccessResponse(response) || !response.data.idToken) return { type: 'failed' };

    const { idToken, user } = response.data;
    // The app keeps no Google session of its own: the next sign-in asks again
    // which account, and signing out of the store leaves nothing behind.
    await GoogleOneTapSignIn.signOut().catch(() => undefined);
    return { type: 'token', token: idToken, email: user.email };
  } catch (error) {
    if (
      isErrorWithCode(error) &&
      // A second tap while the picker is open is not a failure either.
      (error.code === statusCodes.SIGN_IN_CANCELLED || error.code === statusCodes.IN_PROGRESS)
    ) {
      return { type: 'cancelled' };
    }
    return { type: 'failed' };
  }
}
