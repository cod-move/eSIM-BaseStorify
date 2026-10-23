import type { Money, ProductDetail, ProductUpdateRequest } from '@/contracts/mobile/biz/v1';

/**
 * What a 412 on a product change means.
 *
 * A product's `version` moves with every write to it: another operator's
 * edit, but also a sale or a stock count. So "the version changed" does not
 * always mean somebody changed what this operator is changing. After a 412
 * the product is read again and compared field by field:
 *
 * - the fields being changed already hold the new values: the first try went
 *   through and only its answer was lost (`applied`);
 * - they still hold what the edit started from: somebody changed something
 *   else, so the change is sent again with the new version, without asking
 *   (`unchanged`);
 * - anything else: somebody changed the same fields; show the product as it
 *   is now and what changed (`changesSince`), and let the operator decide
 *   (`conflict`).
 */
export type ChangeCheck = 'applied' | 'unchanged' | 'conflict';

/** A field a change touches: the product's own (`price`), or a variant's (`<variant id>.price`). */
type TouchedField = {
  /** The key the comparison uses, and the edit form's errors too. */
  key: string;
  field: 'price' | 'compareAtPrice' | 'status';
  variantId?: string;
};

/** The fields a change touches, in the order the edit sheet shows them. */
export function touchedFields(changes: ProductUpdateRequest): TouchedField[] {
  const fields: TouchedField[] = [];
  if (changes.status !== undefined) fields.push({ key: 'status', field: 'status' });
  if (changes.price !== undefined) fields.push({ key: 'price', field: 'price' });
  if (changes.compareAtPrice !== undefined) {
    fields.push({ key: 'compareAtPrice', field: 'compareAtPrice' });
  }
  for (const change of changes.variants ?? []) {
    for (const field of ['price', 'compareAtPrice'] as const) {
      if (change[field] !== undefined) {
        fields.push({ key: `${change.id}.${field}`, field, variantId: change.id });
      }
    }
  }
  return fields;
}

/** A field's value in one copy of the product: a price, a status, or nothing (no price). */
function valueOf(product: ProductDetail, touched: TouchedField): Money | string | undefined {
  if (touched.field === 'status') return product.status;
  const owner = touched.variantId
    ? product.variants.find((variant) => variant.id === touched.variantId)
    : product;
  return owner?.[touched.field];
}

/** A value as compared: a price by its amount, `null` when there is none (cleared, or never set). */
const comparable = (value: Money | string | undefined) =>
  typeof value === 'object' ? value.amount : (value ?? null);

/** The value the change asks for a field. */
function wanted(changes: ProductUpdateRequest, touched: TouchedField) {
  if (touched.field === 'status') return changes.status;
  const owner = touched.variantId
    ? changes.variants?.find((variant) => variant.id === touched.variantId)
    : changes;
  return owner?.[touched.field];
}

/** Whether every field the change touches holds the same in both readings. */
function same(
  changes: ProductUpdateRequest,
  read: (touched: TouchedField) => unknown,
  other: (touched: TouchedField) => unknown
): boolean {
  return touchedFields(changes).every((touched) => read(touched) === other(touched));
}

/** Compares the product as it is now with the copy the edit started from and the change. */
export function checkChange(
  changes: ProductUpdateRequest,
  base: ProductDetail,
  current: ProductDetail
): ChangeCheck {
  const now = (touched: TouchedField) => comparable(valueOf(current, touched));
  if (same(changes, now, (touched) => wanted(changes, touched))) return 'applied';
  if (same(changes, now, (touched) => comparable(valueOf(base, touched)))) return 'unchanged';
  return 'conflict';
}

/** A field somebody else changed while the operator was changing it too. */
export type OtherChange = TouchedField & {
  before: Money | string | undefined;
  after: Money | string | undefined;
};

/**
 * What somebody else changed among the fields the operator is changing: the
 * value the edit started from and the one the store holds now.
 */
export function changesSince(
  changes: ProductUpdateRequest,
  base: ProductDetail,
  current: ProductDetail
): OtherChange[] {
  return touchedFields(changes)
    .map((touched) => ({
      ...touched,
      before: valueOf(base, touched),
      after: valueOf(current, touched),
    }))
    .filter((change) => comparable(change.before) !== comparable(change.after));
}

/** Somebody else changed the fields being changed: `product` is how it is now. */
export class ProductChangedError extends Error {
  constructor(readonly product: ProductDetail) {
    super('Somebody else changed this product');
    this.name = 'ProductChangedError';
  }
}
