import { EsimAddressFields } from "@/contracts/mobile/shop/v1/esim";
import { defineRoute } from "@/lib/api-core/registry";
import { CONFIGURABLE_ADDRESS_FIELDS, normalizeCheckoutSettings } from "@/lib/checkout/checkout-config";
import { connectDB } from "@/lib/db";
import { getSettings } from "@/models/settings.model";

/**
 * GET /esim/address-fields: which address fields the store's checkout asks
 * for (Settings → Checkout), so the app's address book requires, offers or
 * hides each one as checkout will judge the address — a saved address is then
 * never "incomplete" at checkout.
 */
export const esimAddressFieldsRoute = defineRoute({
  id: "esim.address-fields",
  method: "GET",
  path: "/esim/address-fields",
  auth: "none",
  cache: { kind: "static", revalidate: 60 },
  output: EsimAddressFields,
  handler: async () => {
    await connectDB();
    const checkout = normalizeCheckoutSettings((await getSettings()).checkout);
    return {
      fields: Object.fromEntries(
        CONFIGURABLE_ADDRESS_FIELDS.map((field) => [
          field,
          {
            visibility: checkout.fields[field].visibility,
            ...(checkout.fields[field].label.trim() ? { label: checkout.fields[field].label.trim() } : {}),
          },
        ]),
      ),
    };
  },
});
