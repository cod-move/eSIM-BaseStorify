import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { Text } from '@/components/ui/text';
import { env } from '@/config/env';

import type { SignedInUser } from '../use-sign-in';

/** Up to two letters for the shopper's disc: the first of their first two names. */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toUpperCase();
}

/**
 * The shopper's picture as the sign-in answer gives it: the account's stored
 * value, which for an upload is a path on the store's address. Anything that
 * is not http(s) is left out.
 */
export function pictureUrl(image: string | null): string | undefined {
  if (!image) return undefined;
  try {
    const url = new URL(image, `${env.apiUrl}/`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * "Signing you in…": the store has accepted the shopper and the app
 * is finishing. The sheet closes by itself once the session is in place.
 * Their picture sits on their initials, which show if it cannot be loaded.
 */
export function SigningIn({ user }: { user: SignedInUser }) {
  const t = useTranslations('auth');
  const picture = pictureUrl(user.image);

  return (
    <View className="items-center gap-3 py-10" accessibilityLiveRegion="polite">
      <View
        className="mb-3 size-24 items-center justify-center overflow-hidden rounded-full bg-surface-alt"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <Text variant="title-large">{initials(user.name)}</Text>
        {picture ? (
          <AppImage
            image={picture}
            size="card"
            className="absolute inset-0 rounded-full bg-transparent"
            decorative
          />
        ) : null}
      </View>
      <Text variant="display" className="text-center">
        {t('signingIn')}
      </Text>
      <Text className="text-center">{user.email}</Text>
    </View>
  );
}
