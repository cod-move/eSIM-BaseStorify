import type { EsimTopupOffer } from '@/contracts/mobile/shop/v1/esim';

/** Top-ups on one page, as on the website. */
export const TOPUP_PAGE_SIZE = 10;
/** The search box shows from this many top-ups on. */
export const TOPUP_SEARCH_FROM = 5;

/**
 * The top-ups a search keeps: every word must match the name, the data
 * ("5GB", "5 GB", "500MB") or the days ("7", "7days", "7天"). Same rule as
 * the website's picker (components/esim/esim-topup-picker.tsx). Pure.
 */
export function matchTopups<T extends Pick<EsimTopupOffer, 'name' | 'data' | 'validityDays'>>(
  offers: readonly T[],
  query: string
): T[] {
  const words = query
    .toLowerCase()
    .replace(/(\d)\s*(gb|mb|days?|天)/g, '$1$2')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return [...offers];
  return offers.filter((offer) => {
    const days = offer.validityDays;
    const text =
      `${offer.name} ${offer.data.replace(/\s+/g, '')} ${days}days ${days}day ${days}天 ${days}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/** One page of `items` (0-based), and how many pages there are. */
export function pageOf<T>(items: readonly T[], page: number, size = TOPUP_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(0, page), pages - 1);
  return { items: items.slice(current * size, (current + 1) * size), page: current, pages };
}
