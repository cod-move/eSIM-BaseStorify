import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Build-time configuration.
 *
 * `app.json` holds the app's identity: name, scheme, bundle identifier, icons
 * and plugins. This file adds what depends on the environment a command runs
 * in: identity overrides for a second brand built from the same code, the
 * store's website whose links open the app, Google sign-in's iOS client, the
 * EAS project, and a last check before a store build.
 *
 * Every value read here comes from the environment (`.env.local` on a
 * developer's machine, EAS environment variables or `eas.json` in the cloud).
 * None of it is a secret: all of it ends up inside the app.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  // Set by EAS Build on its workers. `metro.config.js` already refuses to
  // bundle without a store URL; a store build is held to more than that.
  if (process.env.EAS_BUILD_PROFILE === 'production') {
    const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').trim();

    if (process.env.EXPO_PUBLIC_API_MOCK === '1') {
      throw new Error('A production build cannot run on mock data: unset EXPO_PUBLIC_API_MOCK.');
    }
    // iOS and Android both refuse plain http in a release build.
    if (!apiUrl.startsWith('https://')) {
      throw new Error(`A production build needs an https store URL, got "${apiUrl}".`);
    }
  }

  const projectId: string | undefined = process.env.EAS_PROJECT_ID ?? config.extra?.eas?.projectId;
  const storeDomains = readStoreDomains(process.env.STORE_DOMAIN);
  const scheme = process.env.APP_SCHEME ?? config.scheme;
  const googleIosUrlScheme = readGoogleIosUrlScheme(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID);
  const androidPackage = process.env.APP_ANDROID_PACKAGE ?? config.android?.package;

  if (typeof scheme === 'string' && !/^[a-z][a-z0-9+.-]*$/.test(scheme)) {
    throw new Error(`APP_SCHEME must be lower-case letters and digits, got "${scheme}".`);
  }
  if (androidPackage && !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i.test(androidPackage)) {
    throw new Error(
      `APP_ANDROID_PACKAGE must look like com.example.shop, got "${androidPackage}".`
    );
  }

  const adaptiveIcon = {
    ...config.android?.adaptiveIcon,
    foregroundImage:
      process.env.APP_ADAPTIVE_ICON_FOREGROUND ?? config.android?.adaptiveIcon?.foregroundImage,
    backgroundColor:
      process.env.APP_ADAPTIVE_ICON_BACKGROUND ?? config.android?.adaptiveIcon?.backgroundColor,
  };

  return {
    ...config,
    name: process.env.APP_NAME ?? config.name ?? 'Storify',
    slug: process.env.APP_SLUG ?? config.slug ?? 'storify-shop',
    scheme,
    icon: process.env.APP_ICON ?? config.icon,
    plugins: [
      ...(config.plugins?.map((plugin) => withSplashFromEnvironment(plugin)) ?? []),
      ['./plugins/with-google-sign-in', { iosUrlScheme: googleIosUrlScheme }],
    ],
    ios: {
      ...config.ios,
      bundleIdentifier: process.env.APP_IOS_BUNDLE_ID ?? config.ios?.bundleIdentifier,
      ...(storeDomains.length > 0 && {
        associatedDomains: [
          ...(config.ios?.associatedDomains ?? []),
          ...storeDomains.map((domain) => `applinks:${domain}`),
        ],
      }),
    },
    android: {
      ...config.android,
      package: androidPackage,
      adaptiveIcon,
      // The permissions the app uses, and no more: the network, its state for the offline banner, and
      // notifications. The libraries add more to the merged manifest; these are the ones none of the
      // app's code needs (it opens no camera, reads no shared storage, schedules nothing across a
      // restart, and asks for no Wi-Fi details). Photos the shopper chooses to send come from the
      // system photo picker, which needs no permission.
      permissions: [
        'android.permission.INTERNET',
        'android.permission.ACCESS_NETWORK_STATE',
        'android.permission.POST_NOTIFICATIONS',
      ],
      blockedPermissions: [
        'android.permission.CAMERA',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.ACCESS_WIFI_STATE',
        'android.permission.RECEIVE_BOOT_COMPLETED',
      ],
      ...(storeDomains.length > 0 && {
        intentFilters: [
          ...(config.android?.intentFilters ?? []),
          {
            action: 'VIEW',
            autoVerify: true,
            data: storeDomains.map((host) => ({ scheme: 'https', host })),
            category: ['BROWSABLE', 'DEFAULT'],
          },
        ],
      }),
    },
    // An over-the-air update reaches only the builds of the same app version,
    // so a release that changes native code never receives JavaScript written
    // for another one.
    runtimeVersion: { policy: 'appVersion' },
    updates: projectId ? { url: `https://u.expo.dev/${projectId}` } : { enabled: false },
    extra: {
      ...config.extra,
      eas: { ...config.extra?.eas, projectId },
    },
  };
};

/** The splash screen's picture and colour, from `APP_SPLASH_IMAGE` and `APP_SPLASH_BACKGROUND` when set. */
function withSplashFromEnvironment(plugin: NonNullable<ExpoConfig['plugins']>[number]) {
  if (!Array.isArray(plugin) || plugin[0] !== 'expo-splash-screen') return plugin;

  return [
    'expo-splash-screen',
    {
      ...plugin[1],
      image: process.env.APP_SPLASH_IMAGE ?? plugin[1]?.image,
      backgroundColor: process.env.APP_SPLASH_BACKGROUND ?? plugin[1]?.backgroundColor,
    },
  ] satisfies [string, object];
}

/**
 * The URL scheme Google Sign-In on iOS returns to: the app's iOS OAuth client
 * ID (`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, the same variable the app reads at
 * run time) reversed. Unset, there is none, and iOS shows no Google button.
 *
 * `123-abc.apps.googleusercontent.com` → `com.googleusercontent.apps.123-abc`
 */
function readGoogleIosUrlScheme(value: string | undefined): string | undefined {
  const clientId = (value ?? '').trim();
  if (!clientId) return undefined;
  const match = /^([0-9]+-[a-z0-9]+)\.apps\.googleusercontent\.com$/.exec(clientId);
  if (!match) {
    throw new Error(
      `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID must look like 123-abc.apps.googleusercontent.com, got "${clientId}".`
    );
  }
  return `com.googleusercontent.apps.${match[1]}`;
}

/**
 * The store's website addresses whose links open the app instead of a browser
 * (iOS universal links, Android verified app links): `STORE_DOMAIN`, one host or
 * several separated by commas. Unset, the app claims no website.
 *
 * `shop.example.com, https://www.shop.example.com/` → `['shop.example.com', 'www.shop.example.com']`
 */
function readStoreDomains(value: string | undefined): string[] {
  const hosts = (value ?? '')
    .split(',')
    .map((entry) =>
      entry
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/\/.*$/, '')
        .toLowerCase()
    )
    .filter(Boolean);

  for (const host of hosts) {
    if (!/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host)) {
      throw new Error(`STORE_DOMAIN must be a host such as shop.example.com, got "${host}".`);
    }
  }
  return [...new Set(hosts)];
}
