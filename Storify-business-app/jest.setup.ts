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
      expoConfig: {
        name: 'Storify Business',
        slug: 'storify-business',
        scheme: 'storifybiz',
        version: '1.0.0',
      },
    },
  };
});

// Native views Node cannot load, replaced by the stand-in the package ships.
jest.mock('react-native-keyboard-controller', () =>
  jest.requireActual('react-native-keyboard-controller/jest')
);

// A DOM component ("use dom") is a web view of a page the dev server bundles;
// there is no web view or dev server here. The description's visual editor is
// left empty, and tests write the description in its HTML mode.
jest.mock('./src/features/products/editor/description-editor', () => ({
  __esModule: true,
  default: () => null,
}));

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
// A fresh id each time: every `Idempotency-Key` must differ from the last tap's.
jest.mock('expo-crypto', () => ({
  randomUUID: () => jest.requireActual('node:crypto').randomUUID(),
}));
jest.mock('expo-network', () => ({
  addNetworkStateListener: () => ({ remove: () => {} }),
  getNetworkStateAsync: () => Promise.resolve({ isConnected: true, isInternetReachable: true }),
}));
// Push needs a phone. Here notifications are not allowed, so no token is asked
// for; a test of push registration grants them with `mockResolvedValue`. No
// notification has been tapped; a test of opening one returns a response from
// `useLastNotificationResponse`. The permission has no `status`, so the push
// moment (which waits for `undetermined`) stays shut unless a test asks for it.
// A test of one arriving while the app is open calls the listeners given to
// `addNotificationReceivedListener`.
jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 5, HIGH: 6, MAX: 7 },
  getPermissionsAsync: jest.fn(async () => ({ granted: false })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: false })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[test]' })),
  addPushTokenListener: jest.fn(() => ({ remove: () => {} })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: () => {} })),
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  useLastNotificationResponse: jest.fn(() => null),
  clearLastNotificationResponseAsync: jest.fn(async () => {}),
}));
// The in-app web page needs a phone. Here it is a view that keeps the props it
// was given: a test reads the address it opened from `source`.
jest.mock('react-native-webview', () => {
  const { createElement, forwardRef } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const WebView = forwardRef((props: Record<string, unknown>, _ref: unknown) =>
    createElement(View, { ...props, testID: 'web-page' })
  );
  return { WebView, default: WebView };
});
// The camera needs a phone. Here it is a view that keeps the props it was given:
// a test reads a barcode by calling its `onBarcodeScanned` (see
// src/__tests__/camera.ts). The camera is allowed unless a test says otherwise.
jest.mock('expo-camera', () => {
  const { createElement } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const granted = { granted: true, status: 'granted', canAskAgain: true, expires: 'never' };
  return {
    CameraView: (props: Record<string, unknown>) =>
      createElement(View, { ...props, testID: 'camera' }),
    useCameraPermissions: jest.fn(() => [granted, jest.fn(async () => granted), jest.fn()]),
  };
});
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', languageCode: 'en', textDirection: 'ltr' }],
  getCalendars: () => [{ timeZone: 'UTC' }],
}));

// A change of layout direction restarts the app. Here it is only recorded.
jest.mock('expo', () => ({
  ...jest.requireActual('expo'),
  reloadAppAsync: jest.fn(async () => {}),
}));
