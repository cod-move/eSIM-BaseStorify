export const wishlistKeys = {
  /** Every page of the wishlist; the infinite query keeps them under one key. */
  wishlist: (locale: string) => ['private', locale, 'wishlist'] as const,
};
