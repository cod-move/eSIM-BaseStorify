export const cartKeys = {
  cart: (locale: string) => ['private', locale, 'cart'] as const,
  /** The seller of a group of cart lines (GET /vendors/{slug}). */
  cartVendor: (locale: string, slug: string) => ['public', locale, 'cart-vendor', slug] as const,
};
