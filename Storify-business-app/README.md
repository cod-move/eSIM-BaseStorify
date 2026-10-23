# Storify Business

The business app of a Storify store, for iOS and Android: the store's administrators and staff, and its sellers and their staff, run the store from it. It shows the day's figures, takes orders through their steps and creates orders by hand, creates and edits products, changes prices and counts stock (with a barcode scanner), handles returns and refunds, answers customers, and lets administrators review sellers' applications. It is built with Expo (SDK 57) and React Native, and talks to the store through the store's business API (`/api/mobile/biz/v1`).

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

**The app runs in a development build only, never in Expo Go.** The store tells its two apps apart by their link scheme, and Expo Go has one scheme for every app: signed in from Expo Go, the store takes the session for the shopper app's, and every business API call answers 401. Expo Go also has no right-to-left layout and no push notifications on Android.

`pnpm web` opens the app in a browser. It is there to look at a screen quickly, nothing more: the browser build is not a product and has no secure storage. A reload there signs you out. In development, `/dev/kit` shows every component of the design system (`src/components/ui`) in its states, in the theme and language chosen.

### Mock mode

With `EXPO_PUBLIC_API_MOCK=1` the app never touches the network. A mock store inside the app (`src/api/mocks`) answers every request in the shape of the real API, with its access rules and refusals, so a screen can be built before it can be tried on a store. A small "Mock data" label stays on screen. Every password is `password`:

| Email                       | Who                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `admin@example.com`         | The store's owner, an administrator                                                                                                                    |
| `two-step@example.com`      | An administrator with two-step verification: the code is `123456`                                                                                      |
| `staff@example.com`         | The store's staff: orders, products and the inbox to look at; no cancel, prices or replies                                                             |
| `warehouse@example.com`     | The store's staff at the Main warehouse only: its products, and their stock there                                                                      |
| `seller@example.com`        | A seller, Green Leaf Goods: their own orders, products, inbox and payouts                                                                              |
| `seller-staff@example.com`  | Green Leaf Goods' staff: only orders wholly their seller's, and those orders' customers (no notes); inbox replies and notes, no assigning or resolving |
| `unpaid-seller@example.com` | A seller approved but awaiting its first payment: only the catalogue                                                                                   |
| `both@example.com`          | Two workspaces (the store's staff and Green Leaf's): the app asks which                                                                                |
| `no-access@example.com`     | A staff member whose access was switched off: no workspace                                                                                             |
| `shopper@example.com`       | A customer: refused at sign-in, as the store refuses one                                                                                               |

### Against a real store

Set `EXPO_PUBLIC_API_URL` in `.env.local` to the address of the Storify web app and remove `EXPO_PUBLIC_API_MOCK`. On a phone, `localhost` is the phone itself: use your computer's network address (`http://192.168.0.10:3000`).

The store has to be ready for the app. In its admin, under Settings → Mobile app → **Business app**:

- The business app is switched on. While it is off, every request to `/api/mobile/biz` answers 404 and the store refuses the app's sign-in.
- **App link scheme** is `storifybiz`, the `scheme` in `app.json` (or `APP_SCHEME`), without `://`. It must differ from the shopper app's. Sign-in depends on the two matching.
- **Minimum version** is empty, or `1.0.0` or lower. A higher one makes the app ask to be updated.

Only people who run the store can sign in. The store's maintenance mode does not close the business app. A change in these settings can take up to a minute to reach the app.

### A store on your computer

To use a store that runs on your computer, put this in `.env.local` instead of mock mode (`.env.example` has both setups):

```text
EXPO_PUBLIC_API_MOCK=0
EXPO_PUBLIC_API_URL=http://localhost:8081
EXPO_PUBLIC_STORE_DEV_URL=http://localhost:3000
```

`EXPO_PUBLIC_API_URL` is the address of the development server itself, with the port `pnpm start` prints. `EXPO_PUBLIC_STORE_DEV_URL` is the store. The development server (`scripts/dev-proxy.js`, part of Metro and only for `pnpm start`) passes every request to `/api` on to the store as it is, with the session cookie both ways, and tells the store the page is the business app (`Origin: storifybiz://`). That is how the browser preview can use a store at all: the store sends no CORS headers, and a session signed in as a web page would be refused by the business API.

## Environment

| Variable                     | What it is                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `EXPO_PUBLIC_API_URL`        | The store's address, with no slash at the end. The browser preview ignores it during development and asks the development server.                                        |
| `EXPO_PUBLIC_API_MOCK`       | `1` runs the app on mock data and ignores the address.                                                                                                                   |
| `EXPO_PUBLIC_DEFAULT_LOCALE` | The store's default language (`en`). Used for the first request, before the app knows which languages the store offers.                                                  |
| `EXPO_PUBLIC_STORE_DEV_URL`  | The store the development server passes the app's requests on to (`http://localhost:3000`). Read by the development server only.                                         |
| `STORIFY_MAIN_APP_DIR`       | Where the Storify web app is checked out, for `pnpm contracts:sync` and `contracts:check` (`../Storify-main-app`). Read from `.env.local` when the environment lacks it. |

Everything prefixed `EXPO_PUBLIC_` is compiled into the app and can be read by anyone who has it. Never put a secret in one.

The bundler refuses to start when neither an address nor mock mode is set, and an EAS production build (`--profile production`) refuses mock mode and an address that is not `https`. Nothing else checks them: a release built on your own machine takes `.env.local` as it is. Changing a variable needs no cache clearing: `metro.config.js` makes the values part of the bundler's cache key.

## Commands

| Command                     | What it does                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm start`                | Starts the development server, for the development build.                                   |
| `pnpm ios` / `pnpm android` | Builds the native app and runs it on a simulator or a connected device.                     |
| `pnpm web`                  | Opens the browser preview.                                                                  |
| `pnpm check`                | Everything a pull request must pass: types, lint, formatting, tests, and the contract copy. |
| `pnpm typecheck`            | Generates the route and style types, then runs TypeScript.                                  |
| `pnpm lint`                 | ESLint, with the architecture rules.                                                        |
| `pnpm format`               | Formats the code with Prettier.                                                             |
| `pnpm test`                 | Runs the tests. `pnpm test:watch` re-runs them as you edit.                                 |
| `pnpm run doctor`           | Checks the dependencies and the configuration against the Expo SDK.                         |
| `pnpm contracts:sync`       | Copies the business API's contract from the Storify web app into `src/contracts`.           |
| `pnpm contracts:check`      | Fails if `src/contracts` was edited here or is out of date.                                 |

`pnpm run doctor` needs the `run`: `pnpm doctor` alone is pnpm's own check of its installation.

Add a package with `pnpm exec expo install <package>`, never `pnpm add`: it picks the version that matches the Expo SDK.

### The contract

`src/contracts/mobile/biz/v1` is a copy of the web app's `contracts/mobile/biz/v1`, written only by `pnpm contracts:sync`; `src/contracts/manifest.json` records the web app's commit and a hash of the files. The copy shipped here matches the Storify web app of the same release, so you only need to sync after you change the business API's contract in the web app. The script looks for the web app next to this folder (`../Storify-main-app`); when yours is somewhere else, point to it:

```bash
STORIFY_MAIN_APP_DIR=../Storify-main-app-v3.0 pnpm contracts:sync
```

## Where things are

```
app.json            the app's identity: name, scheme, identifiers, icons, plugins
app.config.ts       what depends on the environment a build runs in
eas.json            cloud build profiles: development, preview, production
plugins/            the app's own config plugins, listed in app.json
src/
  app/              the screens, as files (Expo Router)
  features/         one folder per area: workspace, auth, home, orders, products, inbox, more, …
  components/ui/    the design system: Text, AppImage, …
  api/              the API client, endpoint functions, cache setup, and the mock store
  contracts/        a copy of the API's contract (zod). Never edited here.
  i18n/             languages, translations, and the Intl polyfills the phone needs
  theme/            light and dark, and the store's brand colours
  lib/              storage, the auth client, links, device information
  global.css        the design tokens
```

## Making it another brand's app

The store's own name, logo, colours and languages are read from the store when the app starts. The app's identity is in `app.json`: `name` ("Storify Business"), `slug`, `scheme` (`storifybiz`), `ios.bundleIdentifier` and `android.package` (`com.storify.business`), and the icons in `assets/images` (the ones shipped are placeholders). To build another brand from the same code without touching `app.json`, set `APP_NAME`, `APP_SLUG`, `APP_SCHEME`, `APP_IOS_BUNDLE_ID`, `APP_ANDROID_PACKAGE` and `EAS_PROJECT_ID` in the build's environment (`app.config.ts`). The scheme then goes into the store's Settings → Mobile app → Business app.

## Building and releasing

Builds are made with [EAS](https://docs.expo.dev/eas/). Once, per app:

```bash
pnpm dlx eas-cli@latest login
pnpm dlx eas-cli@latest init        # creates the EAS project and writes its id into app.json
```

Cloud builds do not see `.env.local` (keep your own values there; a `.env` file is ignored by git, so no machine's store address ends up in the source, and a blank variable such as `EAS_PROJECT_ID=` counts as unset). Give each environment its variables once:

```bash
pnpm dlx eas-cli@latest env:set --environment production --name EXPO_PUBLIC_API_URL --value https://shop.example.com --visibility plaintext
```

Then:

```bash
pnpm dlx eas-cli@latest build --profile development   # the development build, for your team's devices
pnpm dlx eas-cli@latest build --profile preview       # a release build to hand to testers
pnpm dlx eas-cli@latest build --profile production    # the build that goes to the stores
pnpm dlx eas-cli@latest submit --profile production
```

A change that touches only JavaScript can reach installed apps without a new store release: `pnpm dlx eas-cli@latest update --channel production --environment production`. It is bundled with the variables of the EAS environment it names, never `.env.local`, and nothing refuses mock mode there: keep `EXPO_PUBLIC_API_MOCK` out of the production environment. An update reaches only the builds of the same app version (`version` in `app.json`). Raise the version whenever a native dependency changes.

### Push notifications

The store sends its notifications (a new order, a customer's message, low stock, a seller's application) through Expo's push service to every phone signed in to the business app. A phone registers itself after sign-in and removes itself before sign-out; a build needs three things for that:

- **Its own EAS project.** `eas init` writes `extra.eas.projectId` into `app.json` (or set `EAS_PROJECT_ID`). A push token belongs to one project, so use the business app's, never the shopper app's. A build without a project registers no phone, and receives no over-the-air updates.
- **Its status-bar icon** on Android: `assets/images/notification-icon.png`, 96 × 96, white on transparent (the `expo-notifications` plugin in `app.json`). Replace it with your own mark when you change the app icon.
- **iOS:** an Apple push key for the bundle identifier. EAS creates and keeps it when the first build asks (or `pnpm dlx eas-cli@latest credentials`).
- **Android:** your own Firebase project for the Android package. Put its `google-services.json` in the project folder and give its path as `GOOGLE_SERVICES_JSON` (on EAS, as a file variable: `eas env:create --type file`); then upload the project's FCM V1 service account key: `pnpm dlx eas-cli@latest credentials` → Android → Google Service Account → push notifications (FCM V1).

If the store turned on push security in its Expo account, its Expo access token goes into the store's Settings → Mobile app (one token serves both apps). Push works in development and store builds, never in Expo Go or the browser preview.

On the phone, the app asks once, the first time the tabs open ("Stay on top of the store"), before the phone's own prompt. After that, Account → Notifications offers to turn notifications on, or opens the phone's settings once they were refused.

## Versions that move together

- `better-auth` and `@better-auth/expo` are pinned to the version the store runs. Upgrade the store and the app together.
- `test-renderer` follows React's minor version (1.2.x for React 19.2). Change it when an Expo SDK upgrade changes React.
- ESLint stays on 9 until the plugins in `eslint-config-expo` support 10.
- The stack and its pins are the shopper app's; upgrade the two apps together. Upgrade the Expo SDK with `pnpm exec expo install expo@latest --fix`, then `pnpm run doctor`.
