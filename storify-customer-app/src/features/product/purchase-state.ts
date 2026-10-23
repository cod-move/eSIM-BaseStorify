import type {
  ImageSet,
  Money,
  ProductDetail,
  ProductOption,
  ProductVariant,
} from '@/contracts/mobile/shop/v1';

/** Option id → the id of the value the shopper picked. */
export type Choice = Record<string, string>;

/**
 * Why the product cannot go into the cart now. Each is a message on the page:
 * the shopper is told why, never shown a button that does nothing.
 */
type PurchaseBlock = 'priceOnRequest' | 'notInApp' | 'outOfStock' | 'chooseOptions' | 'preOrder';

export type PurchaseState = {
  /** The variant the choice names, once every option has a value. */
  variant?: ProductVariant;
  price?: Money;
  compareAtPrice?: Money;
  /** The price is the lowest of several: shown as "From". */
  from: boolean;
  /** The most the shopper may put in the cart; 0 when blocked. */
  maxQuantity: number;
  block: PurchaseBlock | null;
  /** Can be bought now, and arrives later. */
  preOrder: boolean;
};

/**
 * What the buying part of the page shows for the shopper's choice. Every
 * answer comes from a field of the product or of its chosen variant; nothing
 * here counts stock or works out a price.
 */
export function purchaseState(
  product: ProductDetail,
  choice: Choice,
  /** Whether this release takes pre-orders (`products.preOrder`). */
  canPreOrder: boolean
): PurchaseState {
  const variant = chosenVariant(product, choice);
  const awaitingChoice = product.requiresVariantChoice && !variant;
  const availability = variant?.availability ?? product.availability;
  const maxQuantity = variant ? variant.maxQuantity : product.maxQuantity;

  const block: PurchaseBlock | null = product.priceOnRequest
    ? 'priceOnRequest'
    : !product.purchasableInApp
      ? 'notInApp'
      : product.availability === 'OUT_OF_STOCK' && !variant
        ? 'outOfStock'
        : awaitingChoice
          ? 'chooseOptions'
          : availability === 'OUT_OF_STOCK' || maxQuantity <= 0
            ? 'outOfStock'
            : availability === 'PRE_ORDER' && !canPreOrder
              ? 'preOrder'
              : null;

  return {
    variant,
    price: product.priceOnRequest ? undefined : (variant?.price ?? product.price),
    compareAtPrice: variant ? variant.compareAtPrice : product.compareAtPrice,
    from: product.priceVaries && !variant,
    maxQuantity: block === null ? maxQuantity : 0,
    block,
    preOrder: block === null && availability === 'PRE_ORDER',
  };
}

/**
 * The options the shopper actually chooses between: an option with no values
 * cannot be picked, so it must not hold the page waiting for a choice.
 */
export function choosableOptions(product: ProductDetail): ProductOption[] {
  return product.options.filter((option) => option.values.length > 0);
}

/**
 * Whether `variant` has `valueId` as its value of option `optionId`. A variant
 * lists one value id per option, in the order of `options`; the id is looked
 * up anywhere in the list unless another option has a value with the same id,
 * when only the option's own position tells them apart.
 */
export function variantHolds(
  product: ProductDetail,
  variant: ProductVariant,
  optionId: string,
  valueId: string
): boolean {
  const shared = product.options.some(
    (option) => option.id !== optionId && option.values.some((value) => value.id === valueId)
  );
  if (!shared) return variant.optionValueIds.includes(valueId);
  const index = product.options.findIndex((option) => option.id === optionId);
  return variant.optionValueIds[index] === valueId;
}

/** The variant whose values are exactly the shopper's choice, one per option. */
function chosenVariant(product: ProductDetail, choice: Choice): ProductVariant | undefined {
  const options = choosableOptions(product);
  if (options.length === 0) {
    return product.variants.length === 1 ? product.variants[0] : undefined;
  }
  if (!options.every((option) => choice[option.id])) return undefined;
  return product.variants.find((variant) =>
    options.every((option) => variantHolds(product, variant, option.id, choice[option.id] ?? ''))
  );
}

/**
 * The choice after the shopper picks `valueId` for `optionId`. The other
 * options keep their values when a variant has that combination. When none
 * does, the choice moves to the variant that has the new value and keeps the
 * most of the other picks (one that can be bought first), so a tap always
 * names a variant and the page follows it.
 */
export function selectValue(
  product: ProductDetail,
  choice: Choice,
  optionId: string,
  valueId: string
): Choice {
  const next = { ...choice, [optionId]: valueId };
  const holds = (variant: ProductVariant, picks: Choice) =>
    Object.entries(picks).every(([id, value]) => variantHolds(product, variant, id, value));
  if (product.variants.length === 0 || product.variants.some((variant) => holds(variant, next))) {
    return next;
  }

  const others = Object.entries(choice).filter(([id]) => id !== optionId);
  const score = (variant: ProductVariant) =>
    others.filter(([id, value]) => variantHolds(product, variant, id, value)).length;
  const buyable = (variant: ProductVariant) =>
    variant.availability !== 'OUT_OF_STOCK' && variant.maxQuantity > 0;
  const best = product.variants
    .filter((variant) => variantHolds(product, variant, optionId, valueId))
    .sort((a, b) => score(b) - score(a) || Number(buyable(b)) - Number(buyable(a)))[0];
  if (!best) return next;

  const moved: Choice = {};
  for (const option of choosableOptions(product)) {
    if (option.id !== optionId && !choice[option.id]) continue;
    const value = option.values.find((candidate) =>
      variantHolds(product, best, option.id, candidate.id)
    );
    if (value) moved[option.id] = value.id;
  }
  return moved;
}

/**
 * Whether picking `valueId` for `optionId`, with the shopper's other choices
 * kept, leads to a variant that can be bought. A value that cannot is drawn
 * dimmed; it can still be picked, and the page then says it is out of stock.
 */
export function isValueAvailable(
  product: ProductDetail,
  choice: Choice,
  optionId: string,
  valueId: string
): boolean {
  const wanted = { ...choice, [optionId]: valueId };
  return product.variants.some(
    (variant) =>
      variant.availability !== 'OUT_OF_STOCK' &&
      variant.maxQuantity > 0 &&
      Object.entries(wanted).every(([id, value]) => variantHolds(product, variant, id, value))
  );
}

/**
 * The picture of what the shopper has picked so far: the first variant that
 * carries every picked value and has a picture of its own. A colour picked
 * before the size already shows that colour.
 */
export function pictureOfChoice(
  product: Pick<ProductDetail, 'variants'>,
  choice: Choice
): ImageSet | undefined {
  const picked = Object.values(choice);
  if (picked.length === 0) return undefined;
  return product.variants.find(
    (variant) => variant.image && picked.every((id) => variant.optionValueIds.includes(id))
  )?.image;
}
