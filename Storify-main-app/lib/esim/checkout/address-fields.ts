import "server-only";

import { CONFIGURABLE_ADDRESS_FIELDS, normalizeCheckoutSettings } from "@/lib/checkout/checkout-config";
import { connectDB } from "@/lib/db";
import { getSettings } from "@/models/settings.model";

export type AddressFieldVisibility = "required" | "optional" | "hidden";

/**
 * The address fields the store's checkout asks for (Settings → Checkout):
 * firstName, lastName, apartment, postalCode, state and phone, each required,
 * optional or hidden. The address books (website and app) follow them, so an
 * address they save is one checkout takes as complete.
 */
export async function storeAddressFields(): Promise<Record<string, { visibility: AddressFieldVisibility; label?: string }>> {
  await connectDB();
  const checkout = normalizeCheckoutSettings((await getSettings()).checkout);
  return Object.fromEntries(
    CONFIGURABLE_ADDRESS_FIELDS.map((field) => {
      const { visibility, label } = checkout.fields[field];
      return [field, { visibility, ...(label.trim() ? { label: label.trim() } : {}) }];
    }),
  );
}
