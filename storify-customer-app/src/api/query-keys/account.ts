export const accountKeys = {
  me: (locale: string) => ['private', locale, 'me'] as const,
  meProduct: (locale: string, productId: string) =>
    ['private', locale, 'me-product', productId] as const,
};
