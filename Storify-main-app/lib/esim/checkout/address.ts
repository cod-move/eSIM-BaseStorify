import "server-only";

import { Product } from "@/models";
import { TOPUP_PRODUCT_TYPE } from "@/lib/esim/topup/product";
import { WALLET_PRODUCT_TYPE } from "@/lib/esim/wallet/product";
import { PAYMENT_FEE_PRODUCT_TYPE } from "@/lib/esim/payments/fee-line";
import type { CheckoutShippingAddress } from "@/lib/checkout/checkout-order-document";

/**
 * An eSIM-only checkout asks for no address (patch P28): nothing ships, and
 * the eSIM is delivered by email. The order still keeps an address, as every
 * Storify order does, so it gets a stand-in: the shopper's name and the
 * store's country.
 */

const ESIM_PRODUCT_TYPES = ["esim", TOPUP_PRODUCT_TYPE, WALLET_PRODUCT_TYPE, PAYMENT_FEE_PRODUCT_TYPE];

const idOf = (value: unknown) =>
  String(value && typeof value === "object" && "_id" in value ? (value as { _id: unknown })._id : (value ?? ""));

/** Whether every line is an eSIM, an eSIM top-up, a balance top-up or a payment fee. */
export async function isEsimOnlyCart(items: readonly { productId?: unknown }[]): Promise<boolean> {
  const ids = [...new Set(items.map((item) => idOf(item.productId)).filter(Boolean))];
  if (!ids.length) return false;
  const esim = await Product.countDocuments({ _id: { $in: ids }, productType: { $in: ESIM_PRODUCT_TYPES } });
  return esim === ids.length;
}

/** The address an eSIM-only order is kept under. */
export function esimStandInAddress(input: { name?: string | null; email?: string | null; phone?: string | null; country?: string | null }): CheckoutShippingAddress {
  return {
    fullName: input.name?.trim() || input.email?.trim() || "eSIM customer",
    street: "Digital delivery (eSIM)",
    city: "-",
    state: "N/A",
    postalCode: "",
    country: input.country?.trim() || "US",
    ...(input.phone ? { phone: input.phone } : {}),
  };
}
