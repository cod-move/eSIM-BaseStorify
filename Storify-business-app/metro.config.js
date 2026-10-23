// Learn more: https://docs.expo.dev/guides/customizing-metro
const { isEnabled: dotenvEnabled, loadProjectEnv } = require('@expo/env');
const { getConfig } = require('expo/config');
const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');
const { withDevProxy } = require('./scripts/dev-proxy');

// Expo CLI loads the `.env` files before it reads this file. A release build
// started from Gradle (`./gradlew assembleRelease`, Android Studio) also reads it
// from expo-updates' own script, which does not, so the files are loaded here as
// Expo CLI would load them: not twice, and never over a variable already set,
// such as one from EAS.
if (dotenvEnabled()) loadProjectEnv(__dirname, { silent: true });

// Metro runs for everything that produces an app: `expo start`, `expo export`,
// a native build and an over-the-air update. Stopping here means none of them
// can ship an app that has no store to talk to.
const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').trim();
if (!apiUrl && process.env.EXPO_PUBLIC_API_MOCK !== '1') {
  throw new Error(
    'EXPO_PUBLIC_API_URL is not set. Point it at your store (for example https://shop.example.com), ' +
      'or set EXPO_PUBLIC_API_MOCK=1 to run on mock data. Copy .env.example to .env.local to start.'
  );
}

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Git worktrees of this repository (`.worktrees/<id>`) are whole copies of the
// app, node_modules included, inside this folder. Metro neither watches nor
// resolves anything in them. Run from inside one of them, the app is the
// worktree: its own files are not blocked.
const worktreeFiles = /[\\/]\.worktrees[\\/].*/;
if (!worktreeFiles.test(__dirname)) {
  config.resolver.blockList = [...[].concat(config.resolver.blockList ?? []), worktreeFiles];
}

// The development server only (`expo start`; an export or a build never calls
// this), and not on mock data, where the app does not touch the network. The web
// build asks the dev server it was opened from (src/config/env.ts) and talks to
// a store through it, as the app: see scripts/dev-proxy.js. The scheme is the one
// the app is built with (app.json, or APP_SCHEME through app.config.ts).
if (process.env.EXPO_PUBLIC_API_MOCK !== '1') {
  const { scheme } = getConfig(__dirname, { skipSDKVersionRequirement: true }).exp;
  config.server.enhanceMiddleware = withDevProxy(config.server.enhanceMiddleware, {
    target: process.env.EXPO_PUBLIC_STORE_DEV_URL,
    scheme: Array.isArray(scheme) ? scheme[0] : scheme,
  });
}

// Expo compiles the EXPO_PUBLIC_ values into the code, and Metro then caches
// each compiled file without looking at them. A bundle made after changing
// .env.local, or for another environment on the same machine, would silently
// keep the old store address or stay in mock mode. Everything in `transformer`
// is part of the cache key, so putting the values there means a file compiled
// with other values is never reused. The two left out are not compiled into the
// code: one is Expo's own, the other is read above and by nothing else.
const notCompiled = ['EXPO_PUBLIC_PROJECT_ROOT', 'EXPO_PUBLIC_STORE_DEV_URL'];
config.transformer.publicEnv = Object.keys(process.env)
  .filter((name) => name.startsWith('EXPO_PUBLIC_') && !notCompiled.includes(name))
  .sort()
  .map((name) => `${name}=${process.env[name]}`);

// Web preview only. Uniwind 1.12 sends react-native-web's InputAccessoryView to
// a file of its own that it does not ship, and the web bundle fails. This puts
// react-native-web's component back. Remove it once Uniwind has the file
// (node_modules/uniwind/dist/module/components/web/InputAccessoryView.js).
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'uniwind/components/InputAccessoryView') {
    return {
      type: 'sourceFile',
      filePath: require.resolve('react-native-web/dist/exports/InputAccessoryView'),
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Uniwind has to be the outermost wrapper: add any other one inside it.
module.exports = withUniwindConfig(config, {
  // Tailwind looks for class names from this file's folder down, so it stays in `src`.
  cssEntryFile: './src/global.css',
  dtsFile: './src/uniwind-types.d.ts',
});
