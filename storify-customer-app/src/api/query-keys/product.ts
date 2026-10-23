export const productKeys = {
  product: (locale: string, slug: string) => ['public', locale, 'product', slug] as const,
  productVendor: (locale: string, slug: string) =>
    ['public', locale, 'product-vendor', slug] as const,
  productBrand: (locale: string, slug: string) =>
    ['public', locale, 'product-brand', slug] as const,
};
