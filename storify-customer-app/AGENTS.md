This is the Storify shopper app: an Expo / React Native client of the Storify store's mobile API. Read `docs/ARCHITECTURE.md` before changing anything; the rules below are its short form.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

The same goes for Uniwind (https://docs.uniwind.dev/llms.txt) and better-auth: read the installed version's types in `node_modules` before using an API.

## Commands

```bash
pnpm exec expo install <package>  # ALWAYS use this to add a package — it picks the version that matches the SDK
pnpm start                        # start the dev server (needs .env.local, see .env.example)
pnpm check                        # types, lint, formatting, tests, contract copy — run before declaring a task done
pnpm doctor                       # diagnose dependency and config issues
```

## Rules of this codebase

- **The app decides nothing about commerce.** Prices, stock, what may be bought and how many arrive from the API as fields. The app prints `money.formatted` and never formats, rounds or calculates money.
- **Types come from `src/contracts`**, a copy of the API's contract. Never edit it by hand and never write a second type for an API answer. The contract changes in the Storify web app; `pnpm contracts:sync` brings the change here.
- **Only `src/api/transport.ts` touches the network.** A new endpoint is a function in `src/api/endpoints`, a key in `src/api/query-keys.ts`, and a hook in its feature. Sign-in, sign-up and sign-out go through `src/lib/auth-client.ts` and nowhere else.
- **A route file in `src/app` stays thin**: it reads data through a feature hook and chooses between loading, error, empty and content. It does not import from `src/api`.
- **Every string a shopper reads is a key in `src/i18n/messages/en.json`.** No literal text in a component.
- **Every colour is a token from `src/global.css`** (`bg-primary`, `text-muted`). No hex values, no Tailwind palette classes (`bg-red-500`).
- **Layouts are direction-neutral**: `ms-*`/`me-*`/`ps-*`/`pe-*`/`start-*`/`end-*`, never `ml-*`/`mr-*`/`left-*`/`right-*`. The app runs in right-to-left languages.
- **Text is `Text` from `@/components/ui/text`, pictures are `AppImage`.** ESLint refuses the React Native ones.
- **Hermes has no `Intl.RelativeTimeFormat`, `Intl.ListFormat`, `Intl.DisplayNames` or `Intl.Segmenter`.** Do not use them or `format.relativeTime` / `format.list`.
- **Nothing store-specific is written into the code.** The store's name, colours, languages and features come from `GET /config`; the app's name, scheme and identifiers from `app.json` and the environment.
- **Delete what a change makes unused.** The source of this app is shipped to buyers.

ESLint enforces most of these (`eslint.config.js`); its messages say where each job belongs.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Screens use the same paths as the store's website (`/products/[slug]`, `/cart`), so a link to the site opens the same place in the app. A new screen's path goes into the link table in the contract.
- Import `Link`, `useRouter`, and `useLocalSearchParams` from `expo-router`; JavaScript tabs come from `expo-router/js-tabs`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`). Run EAS CLI as `pnpm dlx eas-cli@latest <command>`.
Docs: https://docs.expo.dev/eas/index.md

- `ios/` and `android/` are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json`, `app.config.ts` and config plugins.
- The app is developed in a development build (`pnpm ios`, `pnpm android`, or `eas build --profile development`), not in Expo Go: Expo Go has no right-to-left layout, no Apple Pay or Google Pay, no push notifications on Android, and it does not know the app's link scheme.
- Prefer an Expo module over a third-party native library: buyers build and upgrade this app themselves.
