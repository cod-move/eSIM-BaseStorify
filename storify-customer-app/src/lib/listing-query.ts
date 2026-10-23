import { PRODUCT_SORTS, type ProductListQuery, type ProductSort } from '@/contracts/mobile/shop/v1';

/**
 * Links to a list of products come from the store's website: a home block's
 * "View all", a slide a merchant wrote, a brand tile. They carry the website's
 * listing words (`search`, `sortBy`, `stock`, `minPrice`…), which are not the
 * words of the app's API. This is the one place that turns one into the other.
 */

/** A list of products as the app asks for it: the contract's query, without the paging. */
export type ListingQuery = Omit<ProductListQuery, 'cursor' | 'limit'>;

/** The words of a link's query string. Expo Router's search params have this shape. */
export type QueryWords = Record<string, string | string[] | undefined>;

/** The website's `sortBy` (compared in lower case) in the contract's `sort`. */
const SORT_OF_WEBSITE: Record<string, ProductSort> = {
  createdat: 'NEWEST',
  'price-asc': 'PRICE_ASC',
  'price-desc': 'PRICE_DESC',
  popular: 'POPULAR',
  rating: 'RATING',
  relevance: 'RELEVANCE',
};

/**
 * The app's query for the words of a link. The website's words are mapped; the
 * app's own (`q`, `sort`, `inStock`, `onSale`) pass through, so one mapper serves
 * the products screen whoever sent the shopper there.
 *
 * - `search` → `q`
 * - `sortBy` `createdAt | price-asc | price-desc | popular | rating | relevance` → `sort`
 * - `stock=in-stock` → `inStock`
 * - `minPrice`, `maxPrice`: numbers as they are, in the store's currency
 * - `category`, `collection`, `brand`, `vendor`: slugs, one or a comma list (`a,b`),
 *   which the store splits itself
 *
 * A word that is missing or that the app cannot read is left out (`undefined`):
 * a link with a word the store has since renamed still opens a list.
 */
export function listingQueryFromWords(words: QueryWords): ListingQuery {
  return {
    q: first(words.search) ?? first(words.q),
    category: slugs(words.category),
    collection: slugs(words.collection),
    brand: slugs(words.brand),
    vendor: slugs(words.vendor),
    sort: sortOf(words.sortBy) ?? sortOf(words.sort),
    onSale: flag(words.onSale),
    minPrice: price(words.minPrice),
    maxPrice: price(words.maxPrice),
    inStock: first(words.stock)?.toLowerCase() === 'in-stock' ? true : flag(words.inStock),
  };
}

/** The same for a link as written: `/products?sortBy=createdAt&brand=a,b`. */
export function listingQueryFromHref(href: string): ListingQuery {
  return listingQueryFromWords(queryWordsOf(href));
}

/** `/products?brand=a&brand=b&q=red%20shoe#top` → `{ brand: ['a', 'b'], q: ['red shoe'] }` */
export function queryWordsOf(href: string): QueryWords {
  const start = href.indexOf('?');
  const search = start < 0 ? '' : href.slice(start + 1).replace(/#.*$/, '');

  const words = new Map<string, string[]>();
  for (const pair of search.split('&')) {
    if (!pair) continue;
    const [key = '', ...value] = pair.split('=');
    const name = decode(key);
    words.set(name, [...(words.get(name) ?? []), decode(value.join('='))]);
  }
  return Object.fromEntries(words);
}

function decode(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    // A stray `%`: keep the text as it was written.
    return text;
  }
}

function first(value: string | string[] | undefined): string | undefined {
  const text = (Array.isArray(value) ? value[0] : value)?.trim();
  return text ? text : undefined;
}

/** `a, b,,a` or `['a', 'b,c']` → `a,b,c` */
function slugs(value: string | string[] | undefined): string | undefined {
  const parts = (Array.isArray(value) ? value : [value])
    .flatMap((item) => (item ?? '').split(','))
    .map((part) => part.trim())
    .filter((part) => part !== '');
  return parts.length > 0 ? Array.from(new Set(parts)).join(',') : undefined;
}

function sortOf(value: string | string[] | undefined): ProductSort | undefined {
  const word = first(value);
  if (!word) return undefined;
  return (
    SORT_OF_WEBSITE[word.toLowerCase()] ?? PRODUCT_SORTS.find((sort) => sort === word.toUpperCase())
  );
}

function flag(value: string | string[] | undefined): true | undefined {
  const word = first(value)?.toLowerCase();
  return word === 'true' || word === '1' ? true : undefined;
}

/** A price is passed on as it was written: the app never rounds or works out money. */
function price(value: string | string[] | undefined): number | undefined {
  const word = first(value);
  if (word === undefined) return undefined;
  const amount = Number(word);
  return Number.isFinite(amount) && amount >= 0 ? amount : undefined;
}
