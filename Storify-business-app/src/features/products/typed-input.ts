import type { Money } from '@/contracts/mobile/biz/v1';

/**
 * Numbers the operator types: a price, a count of units. The keyboard of the
 * operator's language may type its own digits (Arabic, Persian, Bengali,
 * Hindi); they are read as the store's digits. Spaces are ignored.
 */

/** The code point of the zero of each run of ten digits a phone's keyboard may type. */
const ZEROS = [0x0660, 0x06f0, 0x09e6, 0x0966];
/** The Arabic decimal separator and thousands separator. */
const ARABIC_DECIMAL = String.fromCharCode(0x066b);
const ARABIC_THOUSANDS = String.fromCharCode(0x066c);

function plainDigits(text: string): string {
  let plain = '';
  for (const char of text) {
    const code = char.charCodeAt(0);
    const zero = ZEROS.find((start) => code >= start && code <= start + 9);
    plain += zero === undefined ? char : String(code - zero);
  }
  // `\s` takes the no-break spaces a keyboard may put between thousands too.
  return plain.replace(/\s/g, '');
}

/**
 * A price, read as the number the store takes: the currency's main unit (12.5
 * is 12.50). The store formats and rounds; the app only reads what was typed.
 * A single comma is the decimal separator; with a dot and a comma both, the
 * last one is, and the other groups thousands.
 */
export type TypedPrice = { kind: 'empty' } | { kind: 'invalid' } | { kind: 'price'; value: number };

export function readPrice(text: string): TypedPrice {
  const typed = plainDigits(text).split(ARABIC_DECIMAL).join('.').split(ARABIC_THOUSANDS).join(',');
  if (!typed) return { kind: 'empty' };

  let plain = typed;
  const commas = typed.split(',').length - 1;
  if (typed.includes('.') && commas > 0) {
    const decimal = typed.lastIndexOf('.') > typed.lastIndexOf(',') ? '.' : ',';
    const group = decimal === '.' ? ',' : '.';
    plain = typed.split(group).join('').replace(decimal, '.');
  } else if (commas === 1) {
    plain = typed.replace(',', '.');
  } else if (commas > 1) {
    plain = typed.split(',').join('');
  }

  return /^\d+(\.\d+)?$/.test(plain)
    ? { kind: 'price', value: Number(plain) }
    : { kind: 'invalid' };
}

/** A price as it goes into a field to be changed: the store's amount, or nothing. */
export function priceText(price: Money | undefined): string {
  return price === undefined ? '' : String(price.amount);
}

/** A whole number of units, or `null` when what was typed is not one. */
export function readUnits(text: string): number | null {
  const typed = plainDigits(text);
  return /^\d+$/.test(typed) ? Number(typed) : null;
}
