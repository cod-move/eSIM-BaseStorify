const expoPreset = require('jest-expo/jest-preset');

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // A test is a `*.test.ts(x)` file in a `__tests__` folder under `src`, so a
  // helper beside the tests (`src/__tests__/helpers.tsx`) is not run as one.
  // `roots` keeps Jest out of the rest of the project folder. The pattern is
  // relative on purpose: on Windows Jest reads the `\.` of an absolute path (a
  // folder whose name starts with a dot) as an escaped dot, and
  // `<rootDir>/src/**` matches nothing.
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  transform: {
    // Some packages ship `.mjs` files. They go through the same Babel setup as `.js`.
    '\\.mjs$': expoPreset.transform['\\.[jt]sx?$'],
  },
  // Packages published as ES modules only have to go through Babel, like the
  // app's own code. The first line is Expo's default list.
  transformIgnorePatterns: [
    '/node_modules/(?!(' +
      'react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|standard-navigation|' +
      'better-auth|@better-auth|@better-fetch|better-call|nanostores|@noble|jose|rou3|defu|uncrypto|' +
      'use-intl|intl-messageformat|@formatjs|icu-minify|@schummar|' +
      'htmlparser2|domhandler|domutils|domelementtype|dom-serializer|entities' +
      '))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
  clearMocks: true,
};
