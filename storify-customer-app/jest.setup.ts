/**
 * Runs before every test file.
 *
 * The tests run in Node, the app runs on a phone. This file closes the gaps
 * between the two that matter: it takes away the parts of `Intl` the phone does
 * not have, and stands in for the native modules Node cannot load.
 */

// The app runs on the mock store, exactly as `EXPO_PUBLIC_API_MOCK=1 pnpm start` does.
process.env.EXPO_PUBLIC_API_MOCK = '1';

// Hermes has none of these. Without this, code that needs them passes here and
// crashes on the phone. `PluralRules` and `Locale` come back from the polyfills
// in src/i18n/polyfills.ts, which is what the phone runs on too.
for (const missing of [
  'PluralRules',
  'Locale',
  'RelativeTimeFormat',
  'ListFormat',
  'DisplayNames',
  'Segmenter',
]) {
  delete (Intl as unknown as Record<string, unknown>)[missing];
}

// `storage` and `secureStorage`, in memory.
const memory = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
    removeItem: (key: string) => void memory.delete(key),
    clear: () => memory.clear(),
  },
});
jest.mock('expo-sqlite/localStorage/install', () => ({}));

jest.mock('expo-secure-store', () => {
  const secrets = new Map<string, string>();
  return {
    getItem: (key: string) => secrets.get(key) ?? null,
    setItem: (key: string, value: string) => void secrets.set(key, value),
    deleteItemAsync: async (key: string) => void secrets.delete(key),
  };
});

// Class names are turned into styles by the bundler, which is not running here:
// neither the stylesheet nor the library that reads it can be loaded.
jest.mock('./src/global.css', () => ({}));
// Components still receive `className`; tests assert on text and roles, not on looks.
jest.mock('uniwind', () => ({
  Uniwind: {
    setTheme: jest.fn(),
    updateCSSVariables: jest.fn(),
    updateInsets: jest.fn(),
  },
  useUniwind: () => ({ theme: 'light', hasAdaptiveThemes: false }),
  useCSSVariable: (names: string | string[]) =>
    Array.isArray(names) ? names.map(() => '#000000') : '#000000',
  withUniwind: <T>(component: T) => component,
}));

// On a phone the app config (app.json) is built into the app. Here it is not,
// and the auth client needs the app's scheme from it.
jest.mock('expo-constants', () => {
  const actual = jest.requireActual('expo-constants');
  return {
    ...actual,
    __esModule: true,
    default: {
      ...actual.default,
      expoConfig: { name: 'Storify', slug: 'storify-shop', scheme: 'storify', version: '1.0.0' },
    },
  };
});

// Native views Node cannot load, replaced by the stand-in the package ships.
jest.mock('react-native-keyboard-controller', () =>
  jest.requireActual('react-native-keyboard-controller/jest')
);

// A list draws only the rows that fit its measured size, and nothing is ever
// measured here. This gives every list a screen's worth of room. (The package's
// own `jestSetup` does the same, but in this version it also replaces FlashList
// with an export that does not exist.)
jest.mock('@shopify/flash-list/dist/recyclerview/utils/measureLayout', () => ({
  ...jest.requireActual('@shopify/flash-list/dist/recyclerview/utils/measureLayout'),
  measureParentSize: () => ({ x: 0, y: 0, width: 400, height: 900 }),
  measureFirstChildLayout: () => ({ x: 0, y: 0, width: 400, height: 900 }),
  measureItemLayout: () => ({ x: 0, y: 0, width: 200, height: 300 }),
}));

// Reanimated runs its worklets on a native runtime Node does not have; the
// packages ship stand-ins that run them on the one thread.
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));

// Native modules, answering as a phone set to English would.
jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.0.0',
  nativeBuildVersion: '1',
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000000' }));
jest.mock('expo-network', () => ({ addNetworkStateListener: () => ({ remove: () => {} }) }));
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', languageCode: 'en', textDirection: 'ltr' }],
  getCalendars: () => [{ timeZone: 'UTC' }],
}));

// Google's SDK: the shopper closes the picker, unless a test answers otherwise
// (`jest.mocked(GoogleOneTapSignIn.presentExplicitSignIn).mockResolvedValueOnce(…)`).
// The real module creates its native object as it is imported, which Node has not.
jest.mock('react-native-nitro-google-signin', () => {
  const statusCodes = {
    ONE_TAP_START_FAILED: 'ONE_TAP_START_FAILED',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
    IN_PROGRESS: 'IN_PROGRESS',
    SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    DEVELOPER_ERROR: 'DEVELOPER_ERROR',
  };
  type Response = { type: string; data: unknown };
  return {
    statusCodes,
    GoogleOneTapSignIn: {
      configure: jest.fn(),
      checkPlayServices: jest.fn(async () => {}),
      presentExplicitSignIn: jest.fn(async () => ({ type: 'cancelled', data: null })),
      signOut: jest.fn(async () => {}),
    },
    isSuccessResponse: (response: Response) =>
      response.type === 'success' && response.data !== null,
    isCancelledResponse: (response: Response) => response.type === 'cancelled',
    isNoSavedCredentialFoundResponse: (response: Response) =>
      response.type === 'noSavedCredentialFound',
    isErrorWithCode: (error: unknown) =>
      typeof error === 'object' && error !== null && 'code' in error,
  };
});

// Push notifications: nothing is registered and no notification has been tapped.
// The real module answers half-way in Node, and the app's effects then throw
// while the whole app is rendering, which hangs every test that opens it.
jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  setBadgeCountAsync: jest.fn(async () => true),
  getPermissionsAsync: jest.fn(async () => ({ status: 'undetermined', canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'denied', canAskAgain: false })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[test]' })),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponse: jest.fn(() => null),
  clearLastNotificationResponse: jest.fn(),
}));

// A change of layout direction restarts the app. Here it is only recorded.
jest.mock('expo', () => ({
  ...jest.requireActual('expo'),
  reloadAppAsync: jest.fn(async () => {}),
}));
