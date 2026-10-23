/**
 * What carries a request: the network, or the mock store.
 *
 * The condition is written out in full on purpose. When the app is bundled for
 * release, Expo replaces `process.env.EXPO_PUBLIC_API_MOCK` with its value, the
 * bundler sees a comparison of two constants, and a build that is not in mock
 * mode leaves the mock store and its data out altogether.
 */
const mockFetch: typeof fetch | undefined =
  process.env.EXPO_PUBLIC_API_MOCK === '1'
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- an `import` would bundle the mock store into every build
      (require('./mocks') as typeof import('./mocks')).mockFetch
    : undefined;

// The real `fetch` is called through a wrapper: taken off the global object it
// loses the receiver a browser insists on.
export const transport: typeof fetch = mockFetch ?? ((input, init) => fetch(input, init));
