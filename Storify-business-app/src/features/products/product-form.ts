import {
  PRODUCT_STATUSES,
  type Money,
  type ProductDetail,
  type ProductStatus,
  type ProductUpdateRequest,
} from '@/contracts/mobile/biz/v1';

import { priceText, readPrice } from './typed-input';
import type { OtherChange } from './product-changes';

/**
 * The quick edit of a product: its status and its
 * prices, as the operator types them, and the change they make.
 *
 * Only what differs from the copy the edit started from is sent, so a change
 * never carries a value the operator did not touch (and a 412 is judged on
 * the fields actually changed, `product-changes.ts`). A product with variants
 * is priced per variant; "price on request" is changed on the website only.
 */

export type PriceFields = { price: string; compareAtPrice: string };

export type ProductForm = {
  /** The store's status as sent; one of `PRODUCT_STATUSES` once the operator picks one. */
  status: string;
  price: string;
  compareAtPrice: string;
  /** By variant id. */
  variants: Record<string, PriceFields>;
};

/** What is wrong with a field, keyed as `touchedFields` keys it (`price`, `<variant id>.price`). */
export type FormErrors = Record<string, 'missing' | 'invalid'>;

const isProductStatus = (status: string): status is ProductStatus =>
  (PRODUCT_STATUSES as readonly string[]).includes(status);

export function formOf(product: ProductDetail): ProductForm {
  return {
    status: product.status,
    price: priceText(product.price),
    compareAtPrice: priceText(product.compareAtPrice),
    variants: Object.fromEntries(
      product.variants.map((variant) => [
        variant.id,
        { price: priceText(variant.price), compareAtPrice: priceText(variant.compareAtPrice) },
      ])
    ),
  };
}

/**
 * Reads one price field against what the product had. `undefined` leaves the
 * price alone; `null` clears it (a compare-at price only: a price cannot be
 * taken away, only changed).
 */
function priceChange(
  text: string,
  had: Money | undefined,
  clearable: boolean
): { value?: number | null; error?: 'missing' | 'invalid' } {
  const typed = readPrice(text);
  if (typed.kind === 'invalid') return { error: 'invalid' };
  if (typed.kind === 'empty') {
    if (had === undefined) return {};
    return clearable ? { value: null } : { error: 'missing' };
  }
  return typed.value === had?.amount ? {} : { value: typed.value };
}

/** The change the form makes to `base`, and what stops it from being sent. */
export function changesOf(
  base: ProductDetail,
  form: ProductForm
): { changes: ProductUpdateRequest; errors: FormErrors } {
  const changes: ProductUpdateRequest = {};
  const errors: FormErrors = {};

  if (form.status !== base.status && isProductStatus(form.status)) changes.status = form.status;
  if (base.priceOnRequest) return { changes, errors };

  if (base.variants.length === 0) {
    const price = priceChange(form.price, base.price, false);
    const compareAt = priceChange(form.compareAtPrice, base.compareAtPrice, true);
    if (price.error) errors.price = price.error;
    if (compareAt.error) errors.compareAtPrice = compareAt.error;
    if (price.value !== undefined && price.value !== null) changes.price = price.value;
    if (compareAt.value !== undefined) changes.compareAtPrice = compareAt.value;
    return { changes, errors };
  }

  const variants: NonNullable<ProductUpdateRequest['variants']> = [];
  for (const variant of base.variants) {
    const fields = form.variants[variant.id];
    if (!fields) continue;
    const price = priceChange(fields.price, variant.price, false);
    const compareAt = priceChange(fields.compareAtPrice, variant.compareAtPrice, true);
    if (price.error) errors[`${variant.id}.price`] = price.error;
    if (compareAt.error) errors[`${variant.id}.compareAtPrice`] = compareAt.error;
    const change: (typeof variants)[number] = { id: variant.id };
    if (price.value !== undefined && price.value !== null) change.price = price.value;
    if (compareAt.value !== undefined) change.compareAtPrice = compareAt.value;
    if (Object.keys(change).length > 1) variants.push(change);
  }
  if (variants.length) changes.variants = variants;
  return { changes, errors };
}

export const isEmptyChange = (changes: ProductUpdateRequest) => Object.keys(changes).length === 0;

/**
 * After somebody else changed fields the operator is changing too, those
 * fields show what the store holds now; what the operator typed elsewhere stays.
 */
export function withCurrentValues(form: ProductForm, changed: OtherChange[]): ProductForm {
  const next: ProductForm = { ...form, variants: { ...form.variants } };
  for (const change of changed) {
    const after = change.after;
    if (change.field === 'status') {
      next.status = typeof after === 'string' ? after : next.status;
      continue;
    }
    const text = typeof after === 'object' ? priceText(after) : '';
    if (change.variantId) {
      const fields = next.variants[change.variantId] ?? { price: '', compareAtPrice: '' };
      next.variants[change.variantId] = { ...fields, [change.field]: text };
    } else {
      next[change.field] = text;
    }
  }
  return next;
}

/**
 * The form key of a field error the store answered with (`price`,
 * `variants.0.compareAtPrice`), for the change that was sent.
 */
export function formKeyOf(storeKey: string, changes: ProductUpdateRequest): string | null {
  if (storeKey === 'price' || storeKey === 'compareAtPrice') return storeKey;
  const match = /^variants\.(\d+)\.(price|compareAtPrice)$/.exec(storeKey);
  const variant = match ? changes.variants?.[Number(match[1])] : undefined;
  return variant && match ? `${variant.id}.${match[2]}` : null;
}
