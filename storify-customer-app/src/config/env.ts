/**
 * Build-time settings, compiled into the app (see .env.example).
 *
 * Each variable is read as `process.env.EXPO_PUBLIC_…` in full: that exact form
 * is what Expo replaces with the value when it bundles, and nothing else is.
 */
import { Platform } from 'react-native';

const apiMock = process.env.EXPO_PUBLIC_API_MOCK === '1';

/**
 * Where requests go. In mock mode, a placeholder that cannot resolve, so a
 * request that slipped past the mock would fail instead of reaching somebody's
 * server. In the browser during development, the page's own origin: the store
 * sends no CORS headers, so the development server passes `/api` on to it
 * (scripts/dev-proxy.js), and `EXPO_PUBLIC_API_URL` can stay the store's address
 * for a phone.
 */
function apiUrl(): string {
  if (apiMock) return 'https://mock.storify.invalid';
  if (__DEV__ && Platform.OS === 'web') return window.location.origin;
  return (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');
}

/** A placeholder listing of the Storify Business app until a build sets the real one. */
const BUSINESS_APP_PLACEHOLDER =
  Platform.OS === 'ios'
    ? 'https://apps.apple.com/app/storify-business/id0000000000'
    : 'https://play.google.com/store/apps/details?id=com.storify.business';

export const env = {
  /** The app runs on the mock data in src/api/mocks and never touches the network. */
  apiMock,
  /** The store's address, with no slash at the end (see `apiUrl` above). */
  apiUrl: apiUrl(),
  /** The locale of the first request, before the store's languages are known. */
  defaultLocale: (process.env.EXPO_PUBLIC_DEFAULT_LOCALE ?? '').trim() || 'en',
  /** The Storify Business app in the phone's app store, where "Become a vendor" leads. */
  businessAppUrl:
    (process.env.EXPO_PUBLIC_BUSINESS_APP_URL ?? '').trim() || BUSINESS_APP_PLACEHOLDER,
  /**
   * The app's iOS OAuth client in Google Cloud, for "Continue with Google" on
   * iOS (app.config.ts registers its URL scheme). Unset, iOS shows no Google
   * button. Android and the web need none: they use the store's web client ID
   * from `GET /config`.
   */
  googleIosClientId: (process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '').trim() || null,
} as const;
