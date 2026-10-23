import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { BackHandler, Linking, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTranslations } from 'use-intl';

import { NetworkError } from '@/api/errors';
import { ErrorState, LoadingState } from '@/components/ui/state-view';

import type { WebPageProps } from './web-page.types';

/** What the page opens itself; any other address (mail, phone, another app's link) goes to the phone. */
const IN_PAGE = /^(https?|about|data|blob):/i;

/**
 * A web page inside the app: the store's web dashboard, a carrier's tracking
 * page, a document or a picture behind a short-lived link. The operator never
 * leaves the app for a browser. A mail or phone link goes to the phone's own
 * app; a link that asks for a new window opens here.
 *
 * Private: the page keeps no cookies or cache once it closes, so a sign-in
 * to the website made here does not outlive the page, nor the operator's
 * sign-out on a phone a team shares. On Android a file the page cannot show
 * (a PDF) is saved to Downloads, with a word to say so.
 */
export function WebPage({ url }: WebPageProps) {
  const t = useTranslations('web');
  const page = useRef<WebView>(null);
  const canGoBack = useRef(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Android's back button goes back a page in the website before it leaves it.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!canGoBack.current) return false;
        page.current?.goBack();
        return true;
      });
      return () => subscription.remove();
    }, [])
  );

  const openOutside = (address: string) => {
    void Linking.openURL(address).catch(() => undefined);
  };

  if (failed) {
    return (
      <ErrorState
        error={new NetworkError('offline')}
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
        ref={page}
        key={attempt}
        source={{ uri: url }}
        incognito
        startInLoadingState
        renderLoading={() => (
          <View className="absolute inset-0 bg-background">
            <LoadingState shape="spinner" />
          </View>
        )}
        onError={() => setFailed(true)}
        onNavigationStateChange={(state) => {
          canGoBack.current = state.canGoBack;
        }}
        onShouldStartLoadWithRequest={(request) => {
          if (IN_PAGE.test(request.url)) return true;
          openOutside(request.url);
          return false;
        }}
        onOpenWindow={({ nativeEvent }) => {
          // Android would hand a new window to the browser: it opens in this page instead.
          const target = nativeEvent.targetUrl;
          if (!IN_PAGE.test(target)) {
            openOutside(target);
            return;
          }
          page.current?.injectJavaScript(`window.location.assign(${JSON.stringify(target)});true;`);
        }}
        downloadingMessage={t('downloading')}
        lackPermissionToDownloadMessage={t('downloadRefused')}
      />
    </View>
  );
}
