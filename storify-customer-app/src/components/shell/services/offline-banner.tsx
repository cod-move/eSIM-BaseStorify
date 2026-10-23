import { useEffect } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';

import { Text } from '@/components/ui/text';
import { useIsOffline } from '@/lib/network';

/**
 * Tells the shopper the phone is offline: a `foreground` pill under the status
 * bar, there for as long as the connection is gone. Screens keep showing what
 * the phone saved; a change the shopper makes meanwhile is refused with the
 * offline sentence (see `src/api/transport.ts`).
 */
export function OfflineBanner() {
  const t = useTranslations('offline');
  const offline = useIsOffline();
  const { top } = useSafeAreaInsets();
  const message = t('banner');

  // A screen reader says it once, when the connection goes, wherever its focus is.
  useEffect(() => {
    if (offline) AccessibilityInfo.announceForAccessibility(message);
  }, [offline, message]);

  if (!offline) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{ paddingTop: top + 4 }}
      className="absolute inset-x-0 top-0 items-center px-4">
      <View
        accessible
        accessibilityRole="alert"
        accessibilityLabel={message}
        accessibilityLiveRegion="polite"
        className="min-h-11 justify-center rounded-full bg-foreground px-5 py-2 shadow-float">
        <Text variant="caption" className="text-center text-background">
          {message}
        </Text>
      </View>
    </View>
  );
}
