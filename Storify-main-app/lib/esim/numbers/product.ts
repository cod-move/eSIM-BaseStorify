import "server-only";

import { hiddenProduct, type HiddenProductRef } from "@/lib/esim/catalog/hidden-product";

/**
 * The store products a number card is sold as (NUM-03/05), "Phone number",
 * and its later recharges and data packages (NUM-08/09), "Number top-up":
 * hidden from the storefront, priced per line from the number, its first
 * recharge and data package (lib/esim/cart). See
 * lib/esim/catalog/hidden-product.ts.
 */

export const NUMBER_PRODUCT_TYPE = "esim-number";
export const NUMBER_TOPUP_PRODUCT_TYPE = "esim-number-topup";
export type NumberProductRef = HiddenProductRef;

const numberProduct = hiddenProduct({
  productType: NUMBER_PRODUCT_TYPE,
  settingsKey: "numberProductId",
  name: "Phone number eSIM",
  handle: "esim-number",
  shortDescription: "A mobile number on an eSIM, chosen from the numbers page.",
  description: "<p>A phone number on an eSIM, yours once paid. Install details are in your account and the delivery email.</p>",
  sku: "ESIM-NUMBER",
  optionName: "Number",
  variantName: "Phone number",
});

/** The number product, if it exists; never creates it. Cached for a minute. */
export const findNumberProduct = numberProduct.find;
export const isNumberVariant = numberProduct.isVariant;
/** Creates the number product if there is none (the catalogue publish and a number import call it). */
export const ensureNumberProduct = numberProduct.ensure;

const numberTopupProduct = hiddenProduct({
  productType: NUMBER_TOPUP_PRODUCT_TYPE,
  settingsKey: "numberTopupProductId",
  name: "Number top-up",
  handle: "esim-number-topup",
  shortDescription: "Credit or a data package for a number in your account. Bought from the number's page.",
  description: "<p>Credit or a data package for a phone number in your account. It is added to the number you chose; nothing new to install.</p>",
  sku: "ESIM-NUMBER-TOPUP",
  optionName: "Top-up",
  variantName: "Number top-up",
});

export const findNumberTopupProduct = numberTopupProduct.find;
export const isNumberTopupVariant = numberTopupProduct.isVariant;
/** Made with the number product (a number import). */
export const ensureNumberTopupProduct = numberTopupProduct.ensure;
