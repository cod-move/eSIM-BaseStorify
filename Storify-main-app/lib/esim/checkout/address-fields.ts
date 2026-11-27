import "server-only";

import { CONFIGURABLE_ADDRESS_FIELDS, normalizeCheckoutSettings } from "@/lib/checkout/checkout-config";
import { connectDB } from "@/lib/db";
import { defaultCountryForAddressForms, getAllowedCountryOptions } from "@/lib/intl/country-availability";
import { getSettings } from "@/models/settings.model";

/**
 * The countries the store delivers to (Settings → General), each with its name
 * in the shopper's language, sorted by it; and the one a new address opens on.
 */
export async function storeCountries(locale: string): Promise<{ countries: { value: string; name: string; code: string }[]; defaultCountry: string }> {
  await connectDB();
  const settings = await getSettings();
  const availability = settings.general?.countryAvailability;
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale], { type: "region", fallback: "none" });
  } catch {
    names = null;
  }
  const countries = getAllowedCountryOptions(availability)
    .map(({ value, label }) => ({ value: label, code: value, name: names?.of(value) || label }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  const origin = (settings as { shipping?: { origin?: { country?: string } } }).shipping?.origin?.country;
  return { countries, defaultCountry: defaultCountryForAddressForms(availability, origin) };
}

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
