import { EsimAddressFields } from "@/contracts/mobile/shop/v1/esim";
import { defineRoute } from "@/lib/api-core/registry";
import { storeAddressFields, storeCountries } from "@/lib/esim/checkout/address-fields";

/** GET /esim/address-fields: the address fields as the store's checkout asks for them (the app's address book). */
export const esimAddressFieldsRoute = defineRoute({
  id: "esim.address-fields",
  method: "GET",
  path: "/esim/address-fields",
  auth: "none",
  cache: { kind: "static", revalidate: 60 },
  output: EsimAddressFields,
  handler: async ({ locale }) => ({ fields: await storeAddressFields(), ...(await storeCountries(locale)) }),
});
