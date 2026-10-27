import "server-only";

import { hiddenProduct } from "@/lib/esim/catalog/hidden-product";

/**
 * The store product a wallet top-up is sold as (WAL-01), "Wallet top-up":
 * hidden from the storefront, priced per line from the amount chosen plus
 * the fee (lib/esim/cart). See lib/esim/catalog/hidden-product.ts.
 */

export const WALLET_PRODUCT_TYPE = "esim-wallet-topup";

const walletProduct = hiddenProduct({
  productType: WALLET_PRODUCT_TYPE,
  settingsKey: "walletProductId",
  name: "Wallet top-up",
  handle: "wallet-topup",
  shortDescription: "Add money to your account balance, to spend on eSIMs and top-ups.",
  description: "<p>Money added to your account balance. Use it at checkout for eSIMs and top-ups.</p>",
  sku: "WALLET-TOPUP",
  optionName: "Top-up",
  variantName: "Balance",
});

export const findWalletProduct = walletProduct.find;
export const isWalletVariant = walletProduct.isVariant;
/** Creates the wallet product if there is none (the catalogue publish calls it). */
export const ensureWalletProduct = walletProduct.ensure;
