import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { AppAsset } from '@/components/ui/app-image';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/i18n/locale-store';
import { cn } from '@/lib/cn';
import { useThemeMode } from '@/theme/use-theme';

import type { GoogleButtonProps } from './google-button';

const GOOGLE_MARK = require('../../../../assets/images/google.png') as number;

/**
 * "Continue with Google" in a browser, with Google Identity Services: Google's
 * own script draws its button and, when it is pressed, signs the shopper in in
 * a pop-up and hands back an ID token for the store's web client. It is free
 * and needs no server of the app's own. The phone SDKs do not run in a
 * browser, and Google only lets its own button start this flow, so the web
 * shows Google's outlined pill rather than the app's.
 *
 * The page's address must be one of the web client's *Authorized JavaScript
 * origins* in Google Cloud (`http://localhost:8081` while developing; see the
 * README), or Google's pop-up refuses to open.
 */

const SCRIPT_URL = 'https://accounts.google.com/gsi/client';
/** Google's limits for its button's width, in CSS pixels. */
const WIDTH = { min: 200, max: 400, fallback: 320 };

type GoogleIdentity = {
  accounts: {
    id: {
      initialize(config: {
        client_id: string;
        callback: (response: { credential?: string }) => void;
        ux_mode: 'popup';
        auto_select: boolean;
        context: 'signin';
      }): void;
      renderButton(
        parent: HTMLElement,
        options: {
          type: 'standard';
          theme: 'outline' | 'filled_black';
          size: 'large';
          text: 'continue_with';
          shape: 'pill';
          logo_alignment: 'left';
          width: number;
          locale: string;
        }
      ): void;
    };
  };
};

let script: Promise<GoogleIdentity> | null = null;

/** Google's script, loaded once per page. A failed load is tried again by the next button. */
function loadGoogleIdentity(): Promise<GoogleIdentity> {
  script ??= new Promise<GoogleIdentity>((resolve, reject) => {
    const element = document.createElement('script');
    element.src = SCRIPT_URL;
    element.async = true;
    element.onload = () => {
      const google = (window as { google?: GoogleIdentity }).google;
      if (google?.accounts?.id) resolve(google);
      else reject(new Error('Google Identity Services did not load.'));
    };
    element.onerror = () => reject(new Error('Google Identity Services did not load.'));
    document.head.appendChild(element);
  }).catch((error: unknown) => {
    script = null;
    throw error;
  });
  return script;
}

/**
 * Google's script takes one callback for the page, set once per client ID.
 * The button on screen now is the one that receives the token.
 */
let receiver: ((credential: string) => void) | null = null;
let initializedFor: string | null = null;

/** Always: whether the store has Google on is for `GoogleSignIn` to say. */
export const googleButtonAvailable = () => true;

export function GoogleButton({ webClientId, onResult, loading }: GoogleButtonProps) {
  const t = useTranslations('auth');
  const locale = useLocale();
  const mode = useThemeMode();
  const host = useRef<View>(null);
  const [unloaded, setUnloaded] = useState(false);
  const latest = useRef(onResult);

  useEffect(() => {
    latest.current = onResult;
  });

  useEffect(() => {
    let live = true;
    const receive = (credential: string) => {
      void latest.current({ type: 'token', token: credential, email: null });
    };
    receiver = receive;

    loadGoogleIdentity().then(
      (google) => {
        // react-native-web hands a View's ref over as its element.
        const parent = host.current as unknown as HTMLElement | null;
        if (!live || !parent) return;
        if (initializedFor !== webClientId) {
          google.accounts.id.initialize({
            client_id: webClientId,
            callback: ({ credential }) => {
              if (credential) receiver?.(credential);
            },
            ux_mode: 'popup',
            auto_select: false,
            context: 'signin',
          });
          initializedFor = webClientId;
        }
        parent.replaceChildren();
        google.accounts.id.renderButton(parent, {
          type: 'standard',
          theme: mode === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          logo_alignment: 'left',
          width: Math.min(WIDTH.max, Math.max(WIDTH.min, parent.clientWidth || WIDTH.fallback)),
          locale,
        });
      },
      () => {
        if (live) setUnloaded(true);
      }
    );

    return () => {
      live = false;
      if (receiver === receive) receiver = null;
    };
  }, [webClientId, locale, mode]);

  // Google's script could not be reached: the app's own button stands in, and
  // says so when it is pressed, rather than leaving a gap.
  if (unloaded) {
    return (
      <Button
        variant="social"
        label={t('continueWithGoogle')}
        leading={<AppAsset source={GOOGLE_MARK} className="size-5" />}
        onPress={() => void onResult({ type: 'failed' })}
        loading={loading}
      />
    );
  }

  return (
    <View
      ref={host}
      pointerEvents={loading ? 'none' : 'auto'}
      className={cn('min-h-12 w-full items-center justify-center', loading && 'opacity-50')}
    />
  );
}
