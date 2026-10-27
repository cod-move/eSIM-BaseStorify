import "server-only";

import { hiddenProduct } from "@/lib/esim/catalog/hidden-product";

/**
 * The store product the old store's eSIMs are listed under on each migrated
 * shopper's import order (MIG): hidden from the storefront, never sold, and
 * linked to no plan — so the fulfilment sweep never treats its lines as
 * eSIMs to deliver. See lib/esim/catalog/hidden-product.ts.
 */
const migratedProduct = hiddenProduct({
  productType: "esim-migrated",
  settingsKey: "migratedProductId",
  name: "eSIM from the old store",
  handle: "migrated-esim",
  shortDescription: "An eSIM bought in the old store, carried over.",
  description: "<p>An eSIM bought in the old store, carried over with your account.</p>",
  sku: "ESIM-MIGRATED",
  optionName: "eSIM",
  variantName: "Migrated",
});

/** Creates the product if there is none; the import calls it from the admin. */
export const ensureMigratedProduct = migratedProduct.ensure;
