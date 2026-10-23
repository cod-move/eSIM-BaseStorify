// https://docs.expo.dev/guides/using-eslint/
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

/**
 * Expo's rules, plus the app's own architecture rules. Each of these keeps one
 * job in one place; the message says where that is.
 */

// A class that names one of Tailwind's palette colours (bg-red-500, text-slate-700/80).
const PALETTE_CLASS =
  '(?:^|[\\s:])(?:bg|text|border|accent|ring|outline|shadow|fill|stroke|decoration|divide|from|via|to)-' +
  '(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3}(?![\\w-])';
// A class that names a physical side (ml-4, right-0, rounded-l-lg): wrong in a right-to-left language.
const PHYSICAL_CLASS =
  '(?:^|[\\s:])-?(?:(?:ml|mr|pl|pr|left|right)-(?:\\d|px\\b|auto\\b|full\\b|\\[)|(?:rounded|border)-[lr](?:-|\\b)|rounded-[tb][lr](?:-|\\b))';
const PHYSICAL_MESSAGE =
  'Use the direction-neutral class: ms-/me- (margin), ps-/pe- (padding), start-/end- (position), rounded-s-/rounded-e-, border-s-/border-e-. The app also runs right to left.';
const PALETTE_MESSAGE =
  'Use a design token (bg-primary, text-muted, border-border …), not a Tailwind palette colour. Tokens live in src/global.css.';
module.exports = defineConfig([
  globalIgnores([
    'dist/*',
    // Git worktrees of this repository: each is a whole copy of the app.
    '.worktrees/**',
    '.pnpm-store/**',
    '.expo/*',
    'coverage/*',
    'ios/*',
    'android/*',
    'expo-env.d.ts',
    'src/uniwind-types.d.ts',
    // A copy of the API's contract: it is linted where it is written.
    'src/contracts/**',
  ]),
  expoConfig,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message:
            'Only src/api/transport.ts talks to the network. Add an endpoint function in src/api/endpoints and call the store through it.',
        },
        {
          name: 'localStorage',
          message: 'Use `storage` from @/lib/storage (or `secureStorage` for anything personal).',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: ['Text', 'Image'],
              message:
                'Use Text from @/components/ui/text and AppImage from @/components/ui/app-image.',
            },
            {
              name: 'expo-image',
              message: 'Use AppImage from @/components/ui/app-image.',
            },
          ],
          patterns: [
            {
              group: ['@/api/mocks', '@/api/mocks/*', '**/api/mocks', '**/api/mocks/*'],
              message: 'The mock store is reached through src/api/transport.ts only.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        ...['RelativeTimeFormat', 'ListFormat', 'DisplayNames', 'Segmenter'].map((property) => ({
          object: 'Intl',
          property,
          message: `Intl.${property} does not exist on the phone (Hermes). See src/i18n/polyfills.ts.`,
        })),
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "Property[key.name='style'][value.value='currency']",
          message:
            'The app does not format money. Print `formatted` from the API, with <Price> from @/components/ui/price.',
        },
        { selector: `Literal[value=/${PALETTE_CLASS}/]`, message: PALETTE_MESSAGE },
        { selector: `TemplateElement[value.raw=/${PALETTE_CLASS}/]`, message: PALETTE_MESSAGE },
        { selector: `Literal[value=/${PHYSICAL_CLASS}/]`, message: PHYSICAL_MESSAGE },
        { selector: `TemplateElement[value.raw=/${PHYSICAL_CLASS}/]`, message: PHYSICAL_MESSAGE },
      ],
    },
  },
  {
    // A route file chooses what to show. Reading data is a feature's job.
    files: ['src/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/api/*'],
              message:
                'A route file does not call the API. Use a hook from the feature (src/features/<name>).',
            },
          ],
          paths: [
            {
              name: 'react-native',
              importNames: ['Text', 'Image'],
              message: 'Use Text and AppImage from @/components/ui.',
            },
            { name: 'expo-image', message: 'Use AppImage from @/components/ui/app-image.' },
          ],
        },
      ],
    },
  },
  {
    // The few places that are the exception the rules above point to.
    files: ['src/components/ui/text.tsx', 'src/components/ui/app-image.tsx'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['src/api/transport.ts', 'src/lib/storage.ts'],
    rules: { 'no-restricted-globals': 'off', 'no-restricted-imports': 'off' },
  },
  {
    // The mock store plays the server: it formats prices, as the real one does.
    files: ['src/api/mocks/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['**/__tests__/**', 'jest.setup.ts'],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-imports': 'off',
      'no-restricted-properties': 'off',
      'no-restricted-syntax': 'off',
    },
  },
]);
