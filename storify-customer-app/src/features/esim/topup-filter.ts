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
      `${(offer as { area?: string }).area ?? ''} ${offer.name} ${offer.data.replace(/\s+/g, '')} ${days}days ${days}day ${days}天 ${days}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/** One page of `items` (0-based), and how many pages there are. */
export function pageOf<T>(items: readonly T[], page: number, size = TOPUP_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(0, page), pages - 1);
  return { items: items.slice(current * size, (current + 1) * size), page: current, pages };
}

/** One card: an offer, or a day-pass with the day counts it is sold for (fewest first). */
export interface TopupCard<T> {
  key: string;
  options: T[];
}

/** Offers as cards: those sharing a `dayGroup` are one package for different day counts. Pure. */
export function topupCards<
  T extends Pick<EsimTopupOffer, 'topupPlanId' | 'validityDays' | 'dayGroup'>,
>(offers: readonly T[]): TopupCard<T>[] {
  const cards = new Map<string, TopupCard<T>>();
  for (const offer of offers) {
    const key = offer.dayGroup || offer.topupPlanId;
    const card = cards.get(key);
    if (card) card.options.push(offer);
    else cards.set(key, { key, options: [offer] });
  }
  for (const card of cards.values()) card.options.sort((a, b) => a.validityDays - b.validityDays);
  return [...cards.values()];
}

/** A day-pass card's name without the day count ("China 1GB × 3 days" → "China 1GB"). */
export function cardName(name: string, grouped: boolean) {
  return grouped ? name.replace(/\s*×\s*\d+\s*days?$/i, '') : name;
}

/** The areas a search keeps: every word in the name. Pure. */
export function matchAreas<T extends { name: string }>(areas: readonly T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return words.length
    ? areas.filter((area) => words.every((word) => area.name.toLowerCase().includes(word)))
    : [...areas];
}
