import "server-only";

import { hiddenProduct, type HiddenProductRef } from "@/lib/esim/catalog/hidden-product";

/**
 * The store product a top-up is sold as (TOP-03), "eSIM Top-up": hidden from
 * the storefront, priced per line from its quote (lib/esim/cart). See
 * lib/esim/catalog/hidden-product.ts.
 */

export const TOPUP_PRODUCT_TYPE = "esim-topup";
export type TopupProductRef = HiddenProductRef;

const topupProduct = hiddenProduct({
  productType: TOPUP_PRODUCT_TYPE,
  settingsKey: "topupProductId",
  name: "eSIM Top-up",
  handle: "esim-topup",
  shortDescription: "More data for an eSIM you already have. Bought from the eSIM's page in your account.",
  description: "<p>A top-up for an eSIM in your account. It is added to the eSIM you chose; nothing new to install.</p>",
  sku: "ESIM-TOPUP",
  optionName: "Top-up",
  variantName: "Data top-up",
});

/** The top-up product, if it exists; never creates it. Cached for a minute. */
export const findTopupProduct = topupProduct.find;
export const isTopupVariant = topupProduct.isVariant;
/** Creates the top-up product if there is none (the catalogue publish calls it). */
export const ensureTopupProduct = topupProduct.ensure;
