import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Text } from '@/components/ui/text';
import { useConfig } from '@/features/config/use-config';

import type { GoogleIdToken } from '../google-id-token';
import { GoogleButton, googleButtonAvailable } from './google-button';

type GoogleSignInProps = {
  onResult: (result: GoogleIdToken) => void | Promise<void>;
  loading: boolean;
};

/**
 * "OR", then "Continue with Google", under a sign-in or sign-up form. Shown
 * only while the store has Google sign-in on (`GET /config` sends its client
 * ID) and this build can use it. On sign-up the same button creates the
 * account: the store makes one for an email it has not seen.
 */
export function GoogleSignIn({ onResult, loading }: GoogleSignInProps) {
  const t = useTranslations('auth');
  const webClientId = useConfig().data?.auth?.google?.webClientId;

  if (!webClientId || !googleButtonAvailable()) return null;

  return (
    <View className="gap-5">
      <View className="flex-row items-center gap-3">
        <View className="h-px flex-1 bg-border" />
        <Text variant="caption" className="text-muted">
          {t('or')}
        </Text>
        <View className="h-px flex-1 bg-border" />
      </View>
      <GoogleButton webClientId={webClientId} onResult={onResult} loading={loading} />
    </View>
  );
}
