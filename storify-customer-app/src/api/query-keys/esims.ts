export const esimsKeys = {
  /** The shopper's eSIMs (the eSIM module). */
  esimList: (locale: string) => ['private', locale, 'esims', 'list'] as const,
  esim: (locale: string, id: string) => ['private', locale, 'esims', 'detail', id] as const,
};
