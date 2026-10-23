/**
 * What every area of the mock store builds its answers with: the store's
 * languages and currency, money, pictures, times relative to now, and paging.
 */
import {
  LIST_DEFAULT_LIMIT,
  LIST_MAX_LIMIT,
  type ImageSet,
  type Language,
  type Money,
} from '@/contracts/mobile/biz/v1';

import { MockError, invalid } from '../kit';

/** The mock store's address. It cannot resolve: a request that slipped past the mock fails. */
export const MOCK_ORIGIN = 'https://mock.storify.invalid';

export const MOCK_LANGUAGES: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English', direction: 'ltr' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', direction: 'ltr' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', direction: 'rtl' },
];

export const MOCK_CURRENCY = 'USD';

/**
 * A price as the store sends it: the amount, and the text the app prints. The
 * mock plays the server, so it formats, in the request's language; in the
 * store's currency unless the money is in another (a seller's payouts).
 */
export function money(amount: number, locale: string, currency = MOCK_CURRENCY): Money {
  const rounded = Math.round(amount * 100) / 100;
  return {
    amount: rounded,
    currency,
    formatted: new Intl.NumberFormat(locale, { style: 'currency', currency }).format(rounded),
  };
}

/**
 * A picture in the three sizes, from a placeholder service. The mock's
 * pictures are the only addresses it hands out that resolve, so screens show
 * something.
 */
export function image(seed: string, alt?: string): ImageSet {
  const at = (size: number) => `https://picsum.photos/seed/${encodeURIComponent(seed)}/${size}`;
  return { thumb: at(160), card: at(480), full: at(1080), ...(alt ? { alt } : {}) };
}

const MINUTE = 60_000;

/** An ISO time this many minutes before now, so the mock's lists always look recent. */
export function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * MINUTE).toISOString();
}

export function hoursAgo(hours: number): string {
  return minutesAgo(hours * 60);
}

export function daysAgo(days: number): string {
  return minutesAgo(days * 24 * 60);
}

/** The cursor of the mock's lists: how many rows came before. Opaque to the app. */
function encodeCursor(offset: number): string {
  return `o${offset}`;
}

function decodeCursor(cursor: string | null): number {
  if (cursor === null || cursor === '') return 0;
  const match = /^o(\d+)$/.exec(cursor);
  // The API answers a cursor it did not give out with 400.
  if (!match) throw invalid('cursor', 'This cursor was not given out by the store');
  return Number(match[1]);
}

/** `limit` as the API reads it: a whole number from 1 to 40, 20 when left out. */
export function limitOf(query: URLSearchParams): number {
  const raw = query.get('limit');
  if (raw === null || raw === '') return LIST_DEFAULT_LIMIT;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > LIST_MAX_LIMIT) {
    throw invalid('limit', `Send a whole number from 1 to ${LIST_MAX_LIMIT}`);
  }
  return limit;
}

/** One page of `rows`, by the request's `cursor` and `limit`. */
export function pageOf<T>(rows: readonly T[], query: URLSearchParams) {
  const offset = decodeCursor(query.get('cursor'));
  const limit = limitOf(query);
  const items = rows.slice(offset, offset + limit);
  const next = offset + limit;
  return { items, nextCursor: next < rows.length ? encodeCursor(next) : null };
}

/** A query value that must be one of a vocabulary, or absent. */
export function oneOf<T extends string>(
  query: URLSearchParams,
  name: string,
  values: readonly T[]
): T | undefined {
  const value = query.get(name);
  if (value === null || value === '') return undefined;
  if (!(values as readonly string[]).includes(value)) {
    throw invalid(name, `Expected one of: ${values.join(', ')}`);
  }
  return value as T;
}

/** A boolean query value, as the API reads one (`true` or `1`). */
export function flag(query: URLSearchParams, name: string): boolean {
  const value = query.get(name);
  return value === 'true' || value === '1';
}

/** A search term: trimmed, lower-cased; `null` when there is none. */
export function searchOf(query: URLSearchParams, name = 'search'): string | null {
  const value = query.get(name)?.trim().toLowerCase();
  return value ? value : null;
}

/** 404 as the API answers it for anything out of the operator's reach. */
export function notFound(what: string): MockError {
  return new MockError(404, 'NOT_FOUND', `${what} not found`);
}

/** A text field of the body: trimmed, or `null` when missing or empty. */
export function textOf(body: Record<string, unknown>, name: string): string | null {
  const value = body[name];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
