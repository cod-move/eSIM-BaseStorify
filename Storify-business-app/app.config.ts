import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Build-time configuration.
 *
 * `app.json` holds the app's identity: name, scheme, bundle identifier, icons
 * and plugins. This file adds what depends on the environment a command runs
 * in: identity overrides for a white-label build made from the same code, the
 * EAS project, and a last check before a store build.
 *
 * The scheme matters more than it looks: the store tells the business app's
 * sessions from the shopper app's by it. It must be the one entered in the
 * store's Settings → Mobile app → Business app, and it must differ from the
 * shopper app's, or sign-in is refused (`INVALID_ORIGIN`).
 *
 * Every value read here comes from the environment (`.env.local` on a
 * developer's machine, EAS environment variables or `eas.json` in the cloud).
 * None of it is a secret: all of it ends up inside the app.
 */
/** A variable of the environment, or nothing when it is unset or blank: an empty `KEY=` line is no value. */
function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

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

  // `eas init` writes the project into app.json; an empty variable must not hide it.
  const projectId: string | undefined = env('EAS_PROJECT_ID') ?? config.extra?.eas?.projectId;

  return {
    ...config,
    name: env('APP_NAME') ?? config.name ?? 'Storify Business',
    slug: env('APP_SLUG') ?? config.slug ?? 'storify-business',
    scheme: env('APP_SCHEME') ?? config.scheme,
    ios: {
      ...config.ios,
      bundleIdentifier: env('APP_IOS_BUNDLE_ID') ?? config.ios?.bundleIdentifier,
    },
    android: {
      ...config.android,
      package: env('APP_ANDROID_PACKAGE') ?? config.android?.package,
      // Push on Android goes through the app's own Firebase project: its
      // google-services.json (a path; on EAS, a file variable). Without it the
      // phone has no push token, and the app registers none (README, Push).
      ...(env('GOOGLE_SERVICES_JSON') ? { googleServicesFile: env('GOOGLE_SERVICES_JSON') } : {}),
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
