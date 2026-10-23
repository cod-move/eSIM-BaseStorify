import { useState } from 'react';
import { useTranslations } from 'use-intl';

import { AppAsset } from '@/components/ui/app-image';
import { Button } from '@/components/ui/button';

import { canUseGoogleSignIn, requestGoogleIdToken, type GoogleIdToken } from '../google-id-token';

const GOOGLE_MARK = require('../../../../assets/images/google.png') as number;

export type GoogleButtonProps = {
  /** The store's web client ID, from `GET /config`. */
  webClientId: string;
  /** What Google answered; `useSignIn().signInWithGoogle` takes it from here. */
  onResult: (result: GoogleIdToken) => void | Promise<void>;
  /** The store is checking the token. */
  loading: boolean;
};

/** Whether this build can show the button (on the web, see google-button.web.tsx). */
export const googleButtonAvailable = canUseGoogleSignIn;

/**
 * "Continue with Google" on a phone: the app's own outlined pill, with Google's
 * mark at the start. A press opens the phone's Google account picker; the
 * button spins until the picker has answered and then while the store checks.
 */
export function GoogleButton({ webClientId, onResult, loading }: GoogleButtonProps) {
  const t = useTranslations('auth');
  const [asking, setAsking] = useState(false);

  const press = async () => {
    if (asking) return;
    setAsking(true);
    let result: GoogleIdToken;
    try {
      result = await requestGoogleIdToken(webClientId);
    } finally {
      setAsking(false);
    }
    await onResult(result);
  };

  return (
    <Button
      variant="social"
      label={t('continueWithGoogle')}
      leading={<AppAsset source={GOOGLE_MARK} className="size-5" />}
      onPress={press}
      loading={asking || loading}
    />
  );
}
