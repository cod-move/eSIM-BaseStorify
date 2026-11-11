export const esimsKeys = {
  /** The shopper's eSIMs (the eSIM module). */
  esimList: (locale: string) => ['private', locale, 'esims', 'list'] as const,
  esim: (locale: string, id: string) => ['private', locale, 'esims', 'detail', id] as const,
  esimTopups: (locale: string, id: string) => ['private', locale, 'esims', 'topups', id] as const,
  /** The destinations on sale, the same for everybody. */
  esimDestinations: (locale: string) => ['public', locale, 'esims', 'destinations'] as const,
  esimDestination: (locale: string, scope: string, slug: string) =>
    ['public', locale, 'esims', 'destination', scope, slug] as const,
  /** The balance and the referral centre (APP-07). */
  esimWallet: (locale: string) => ['private', locale, 'esims', 'wallet'] as const,
  esimReferrals: (locale: string) => ['private', locale, 'esims', 'referrals'] as const,
  esimKyc: (locale: string) => ['private', locale, 'esims', 'kyc'] as const,
  /** Phones that take an eSIM. */
  esimDevices: (locale: string) => ['public', locale, 'esims', 'devices'] as const,
  /** Phone numbers (NUM-03~09): the numbers on sale, and the shopper's own. */
  esimNumberShop: (locale: string, query: object) =>
    ['public', locale, 'esims', 'number-shop', query] as const,
  esimNumberPrice: (locale: string, query: object) =>
    ['public', locale, 'esims', 'number-price', query] as const,
  esimNumberList: (locale: string) => ['private', locale, 'esims', 'numbers'] as const,
  esimNumber: (locale: string, id: string) => ['private', locale, 'esims', 'number', id] as const,
  /** One number's reads from the network: `part` services, data-limit, history-7, diagnostics. */
  esimNumberPart: (locale: string, id: string, part: string) =>
    ['private', locale, 'esims', 'number', id, part] as const,
  /** How a payment on a gateway's page stands (APP-09). */
  redirectOutcome: (locale: string, reference: string) =>
    ['private', locale, 'esims', 'redirect-outcome', reference] as const,
};
