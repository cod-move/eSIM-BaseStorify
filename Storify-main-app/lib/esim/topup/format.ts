/** A store price for a server-rendered page; the store sells in USD only (decided 2026-10-25). */
export function formatStorePrice(minor: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(minor / 100);
}
