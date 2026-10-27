export const esimsKeys = {
  /** The shopper's eSIMs (the eSIM module). */
  esimList: (locale: string) => ['private', locale, 'esims', 'list'] as const,
  esim: (locale: string, id: string) => ['private', locale, 'esims', 'detail', id] as const,
  esimTopups: (locale: string, id: string) => ['private', locale, 'esims', 'topups', id] as const,
  /** The destinations on sale, the same for everybody. */
  esimDestinations: (locale: string) => ['public', locale, 'esims', 'destinations'] as const,
  esimDestination: (locale: string, scope: string, slug: string) =>
    ['public', locale, 'esims', 'destination', scope, slug] as const,
};
