import { useRouter } from 'expo-router';
import { useState } from 'react';

import type { ProductDetail } from '@/contracts/mobile/shop/v1';
import { useCart, useSetCartLine } from '@/features/cart/use-cart';
import { useCapability } from '@/features/config/use-capability';

import { purchaseState, selectValue, type Choice } from './purchase-state';

/**
 * The shopper's choice on the product page and what it allows, shared by the
 * stacked buttons and the pinned bar so both follow the same rules.
 *
 * No option is chosen for the shopper: until every option has a value there
 * is no variant, and the page asks for the choice instead of adding something
 * they did not pick.
 */
export function useProductPurchase(product: ProductDetail) {
  const router = useRouter();
  const canPreOrder = useCapability('products.preOrder');
  const cart = useCart();
  const setLine = useSetCartLine();
  const [choice, setChoice] = useState<Choice>({});
  const [wanted, setWanted] = useState(1);

  const state = purchaseState(product, choice, canPreOrder);
  // The stepper never shows more than the store allows for the chosen variant.
  const quantity = Math.max(1, Math.min(wanted, state.maxQuantity || 1));
  const inCart =
    cart.data?.lines.find(
      (line) => line.productId === product.id && line.variantId === state.variant?.id
    )?.quantity ?? 0;

  const add = (then?: () => void) => {
    if (state.block !== null) return;
    // The cart takes the line's new quantity, not "this many more".
    setLine.mutate(
      {
        productId: product.id,
        variantId: state.variant?.id,
        quantity: Math.min(inCart + quantity, state.maxQuantity),
      },
      { onSuccess: then }
    );
  };

  return {
    ...state,
    choice,
    choose: (optionId: string, valueId: string) => {
      // A new choice is a new thing to buy: forget the last "added" or error.
      setLine.reset();
      setChoice((current) => selectValue(product, current, optionId, valueId));
    },
    quantity,
    setQuantity: setWanted,
    addToCart: () => add(),
    // Straight to checkout, guests too: checkout sends a guest to sign in where the store requires it.
    buyNow: () => add(() => router.push('/checkout')),
    adding: setLine.isPending,
    added: setLine.isSuccess,
    error: setLine.error,
  };
}

export type ProductPurchase = ReturnType<typeof useProductPurchase>;
