import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { resolveAppLink } from '@/lib/links';

import type { WebPageProps } from './web-page.types';

/**
 * A page of the store's website inside the app: the blog, "Become a vendor",
 * the policies, the help centre. The shopper never leaves the app. A link on
 * the page to a place the app has a screen for opens that screen; a mail or
 * phone link goes to the phone's own app.
 */
export function WebPage({ url }: WebPageProps) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  if (failed) {
    return (
      <ErrorState
        error={undefined}
        onRetry={() => {
          setFailed(false);
          setAttempt((count) => count + 1);
        }}
      />
    );
  }

  return (
    <View className="flex-1 bg-background">
      <WebView
        key={attempt}
        source={{ uri: url }}
        startInLoadingState
        renderLoading={() => (
          <View className="absolute inset-0 bg-background">
            <LoadingState />
          </View>
        )}
        onError={() => setFailed(true)}
        onShouldStartLoadWithRequest={(request) => {
          if (request.url === url) return true;
          if (!/^https?:\/\//i.test(request.url)) {
            Linking.openURL(request.url).catch(() => undefined);
            return false;
          }
          const screen = request.isTopFrame ? resolveAppLink(request.url) : null;
          if (screen) {
            // Checked against the contract's link table by resolveAppLink.
            router.push(screen as Href);
            return false;
          }
          return true;
        }}
      />
    </View>
  );
}
