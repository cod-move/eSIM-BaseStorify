# Storify mobile app

The shopper app for a Storify store, for iOS and Android. It is built with Expo (SDK 57) and React Native, and talks to the store through the store's mobile API.

How the code is organised, and the rules it follows, are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Read it before you add a screen.

## What you need

|                   |                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| Node.js           | 22.13 or newer                                                                                               |
| pnpm              | 11 (`npm install -g pnpm`). The exact version is pinned in `package.json` and pnpm switches to it by itself. |
| To run on iOS     | a Mac with Xcode, or an Expo account to build in the cloud with EAS                                          |
| To run on Android | Android Studio, or an Expo account to build in the cloud with EAS                                            |
| A store           | optional. Without one the app runs on mock data.                                                             |

The app runs on iOS 16.4 and later, and Android 7 (API 24) and later.

## Start

```bash
pnpm install
cp .env.example .env.local   # as it is, the app runs on mock data
pnpm ios                     # or: pnpm android
```

`pnpm ios` and `pnpm android` build a **development build** and open it. That takes a few minutes the first time. After that, `pnpm start` is enough until a native dependency changes.

Work in the development build, not in Expo Go. Expo Go has no right-to-left layout, no Apple Pay or Google Pay, no push notifications on Android, and it does not know the app's link scheme.

`pnpm web` opens the app in a browser. It is there to look at a screen quickly, nothing more: the browser build is not a product, has no secure storage, and handles mixed-direction text differently from a phone.

### Mock mode

With `EXPO_PUBLIC_API_MOCK=1` the app never touches the network. A mock store inside the app (`src/api/mocks`) answers every request in the shape of the real API, so a screen can be built before its endpoint exists. A small "Mock data" label stays on screen. Sign in with any email and the password `password`.

### Against a real store

Set `EXPO_PUBLIC_API_URL` in `.env.local` to the address of the Storify web app and remove `EXPO_PUBLIC_API_MOCK`. On a phone, `localhost` is the phone itself: use your computer's network address (`http://192.168.0.10:3000`). The browser preview (`pnpm web`) cannot call a store directly: set `EXPO_PUBLIC_STORE_DEV_URL` to the same address, as described below.

The store has to be ready for the app. In its admin, under Settings → Mobile app:

- **Mobile API** is switched on. While it is off, every request to `/api/mobile` answers 404, and the store does not accept the app's sign-in.
- **App link scheme** is `storify`, the `scheme` in `app.json` (or `APP_SCHEME`), without `://`. Sign-in depends on the two matching.
- **Minimum version** is empty, or `1.0.0` or lower. A higher one makes the app's own gate block everything.

Also, maintenance mode is off (or your computer is on its allow-list), and the store serves the language in `EXPO_PUBLIC_DEFAULT_LOCALE`. A change in these settings can take up to a minute to reach the app.

### A store on your computer

To use a store that runs on your computer, use this in `.env.local` instead of mock mode (`.env.example` has both setups):

```text
EXPO_PUBLIC_API_MOCK=0
EXPO_PUBLIC_API_URL=http://localhost:8081
EXPO_PUBLIC_STORE_DEV_URL=http://localhost:3000
```

`EXPO_PUBLIC_API_URL` is the address of the development server itself, with the port `pnpm start` prints. `EXPO_PUBLIC_STORE_DEV_URL` is the store, and `http://localhost:3000` is its default. The browser preview asks the development server it was opened from whatever `EXPO_PUBLIC_API_URL` says, so a phone can use the store's own address while the browser uses the same `.env.local`. The app asks the development server, and the development server (`scripts/dev-proxy.js`, part of Metro and only for `pnpm start`) passes every request to `/api` on to the store as it is: browsing, sign-in and sign-up, the cart, wishlists, orders, and the session cookie both ways. Everything you do is saved in the store's database.

A browser cannot call the store itself: the store sends no CORS headers, and its sign-in refuses a page from another address. This way the web build only calls the origin it came from, and the development server tells the store the page is the app (`Origin: storify://`, the scheme in `app.json`). The store marks each session with the client it was signed in from and the mobile API accepts only the app's, so a session opened as a web page would not work in the app. Only `OPTIONS` is answered by the development server itself, because on some routes the store would cache an error for every client.

Pictures are absolute addresses on the store and the app loads them directly, so a phone must reach the store's port 3000 as well. On a phone, use your computer's address in `EXPO_PUBLIC_API_URL` (`http://192.168.0.10:8081`).

## Environment

| Variable                           | What it is                                                                                                                                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_API_URL`              | The store's address, with no slash at the end. The browser preview ignores it during development and asks the development server.                                                                                                 |
| `EXPO_PUBLIC_API_MOCK`             | `1` runs the app on mock data and ignores the address.                                                                                                                                                                            |
| `EXPO_PUBLIC_DEFAULT_LOCALE`       | The store's default language (`en`). Used for the first request, before the app knows which languages the store offers.                                                                                                           |
| `EXPO_PUBLIC_STORE_DEV_URL`        | The store the development server passes the app's requests on to (`http://localhost:3000`). Read by the development server only.                                                                                                  |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | The app's iOS OAuth client for "Continue with Google" (`123-abc.apps.googleusercontent.com`). Unset, iOS shows no Google button. Changes the native project: make a new build. See [Continue with Google](#continue-with-google). |
| `STORIFY_MAIN_APP_DIR`             | Where the Storify web app is checked out, for `pnpm contracts:sync` and `contracts:check` (`../Storify-main-app`). Read from `.env.local` when the environment lacks it.                                                          |

Everything prefixed `EXPO_PUBLIC_` is compiled into the app and can be read by anyone who has it. Never put a secret in one.

The bundler refuses to start when neither an address nor mock mode is set, and a production build refuses mock mode and an address that is not `https`. Both exist so that an app without a store behind it cannot be shipped by accident.

A variable can be changed and the app bundled again without clearing anything. Expo compiles these values into the code and the bundler's cache does not look at them, so `metro.config.js` makes them part of the cache key: a file compiled for another address, or for mock mode, is never reused.

## Commands

| Command                     | What it does                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm start`                | Starts the development server.                                                              |
| `pnpm ios` / `pnpm android` | Builds the native app and runs it on a simulator or a connected device.                     |
| `pnpm web`                  | Opens the browser preview.                                                                  |
| `pnpm check`                | Everything a pull request must pass: types, lint, formatting, tests, and the contract copy. |
| `pnpm typecheck`            | Generates the route types, then runs TypeScript.                                            |
| `pnpm lint`                 | ESLint, with the architecture rules.                                                        |
| `pnpm format`               | Formats the code with Prettier.                                                             |
| `pnpm test`                 | Runs the tests. `pnpm test:watch` re-runs them as you edit.                                 |
| `pnpm run doctor`           | Checks the dependencies and the configuration against the Expo SDK.                         |
| `pnpm contracts:sync`       | Copies the API contract from the Storify web app into `src/contracts`.                      |
| `pnpm contracts:check`      | Fails if `src/contracts` was edited here or is out of date.                                 |

`pnpm run doctor` needs the `run`: `pnpm doctor` alone is pnpm's own check of its installation.

Add a package with `pnpm exec expo install <package>`, never `pnpm add`: it picks the version that matches the Expo SDK.

## Where things are

```
app.json            the app's identity: name, scheme, identifiers, icons, plugins
app.config.ts       what depends on the environment a build runs in
eas.json            cloud build profiles: development, preview, production
plugins/            the app's own config plugins, listed in app.json
src/
  app/              the screens, as files (Expo Router). Same paths as the store's website.
  features/         one folder per area: home, catalog, product, cart, checkout, account, …
  components/ui/    the design system: Text, Button, AppImage, Price, Icon, …
  api/              the API client, endpoint functions, cache setup, and the mock store
  contracts/        a copy of the API's contract (zod). Never edited here.
  i18n/             languages, translations, and the Intl polyfills the phone needs
  theme/            light and dark, and the store's brand colours
  lib/              storage, the auth client, links, device information
  global.css        the design tokens
.maestro/           end-to-end flows
```

## Making it one store's app

Everything that makes this "a store's app" is in two places.

**Built into the app**, in `app.json`:

- `name`, `slug`: the app's name.
- `scheme`: the app's link scheme (`mystore` → `mystore://`). The store's admin enters the same value in the mobile app settings; sign-in depends on the two matching.
- `ios.bundleIdentifier`, `android.package`: the app's identifiers in the stores.
- The icon and splash images in `assets/images`. The ones shipped are placeholders.
- `merchantIdentifier` of the Stripe plugin, to offer Apple Pay.

`EXPO_PUBLIC_API_URL` names the store.

**Read from the store when the app starts**: its name and logo, brand colours, languages, currency, and which features are on. Nothing in the code names a store, a colour or a language, so the same code builds any store's app.

To build a second brand from the same code without touching `app.json`, set `APP_NAME`, `APP_SLUG`, `APP_SCHEME`, `APP_IOS_BUNDLE_ID`, `APP_ANDROID_PACKAGE` and `EAS_PROJECT_ID` in the build's environment (`app.config.ts`).

### Continue with Google

The sign-in and sign-up screens show "Continue with Google" while the store has Google sign-in on (Admin → Settings → OAuth); `GET /config` then sends the store's Google client ID. The phone's own Google SDK signs the shopper in (Credential Manager on Android, Google Sign-In on iOS, through `react-native-nitro-google-signin`) and the app hands the ID token it gets to the store, which answers with a session as it does to a password. No browser is involved. It needs a development build: Expo Go cannot load the SDK.

In [Google Cloud](https://console.cloud.google.com/apis/credentials), in the project of the store's own Google client:

1. **Web application** client: the store's. Its client ID and secret go into the store's admin (Settings → OAuth), not into the app. For the browser preview, add the preview's address to its **Authorized JavaScript origins**: `http://localhost:8081` and `http://localhost`.
2. **Android** client: the app's package name (`android.package` or `APP_ANDROID_PACKAGE`) and the SHA-1 fingerprint of each key that signs it: the debug keystore of a local build (`cd android && ./gradlew signingReport`), the keystore of EAS builds (`eas credentials`), and Google Play's app signing key (Play Console → Test and release → App integrity). Nothing from it goes into the app or the store.
3. **iOS** client: the app's bundle ID (`ios.bundleIdentifier` or `APP_IOS_BUNDLE_ID`). Its client ID goes into the build as `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`; `app.config.ts` registers its URL scheme. Without it, iOS shows no Google button.

All three must be in the same project, and the consent screen (Google Auth Platform → Branding) must be set up. A new development build is needed after the first install of the module and after changing `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.

The browser preview uses Google's own button (Google Identity Services), drawn by Google's script.

## Building and releasing

Builds are made with [EAS](https://docs.expo.dev/eas/). Once, per app:

```bash
pnpm dlx eas-cli@latest login
pnpm dlx eas-cli@latest init        # creates the EAS project and writes its id into app.json
```

Cloud builds do not see `.env.local`. Give each environment its variables once:

```bash
pnpm dlx eas-cli@latest env:set --environment production --name EXPO_PUBLIC_API_URL --value https://shop.example.com --visibility plaintext
```

Then:

```bash
pnpm dlx eas-cli@latest build --profile development   # a development build for your team's devices
pnpm dlx eas-cli@latest build --profile preview       # a release build to hand to testers
pnpm dlx eas-cli@latest build --profile production    # the build that goes to the stores
pnpm dlx eas-cli@latest submit --profile production
```

A change that touches only JavaScript can reach installed apps without a new store release:

```bash
pnpm dlx eas-cli@latest update --channel production --environment production --message "What changed"
```

An update only reaches the builds of the same app version (`version` in `app.json`). Raise the version whenever a native dependency changes.

### A release APK without EAS

With Android Studio and JDK 17 installed, a computer can build an APK to install on a phone:

```bash
pnpm exec expo prebuild -p android
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a
```

The APK is `android/app/build/outputs/apk/release/app-release.apk`. The build reads `.env.local`, so `EXPO_PUBLIC_API_URL` has to be the store's `https` address: a release build refuses plain `http`. The architectures are the phones' and leave out the emulators', so the build is shorter and the APK smaller. The APK is signed with a debug key, so it is for testers: Google Play takes the production build above.

## Versions that move together

- `better-auth` and `@better-auth/expo` are pinned to the version the store runs. Upgrade the store and the app together.
- `test-renderer` follows React's minor version (1.2.x for React 19.2). Change it when an Expo SDK upgrade changes React.
- ESLint stays on 9 until the plugins in `eslint-config-expo` support 10.
- Upgrade the Expo SDK with `pnpm exec expo install expo@latest --fix`, then `pnpm run doctor`.
