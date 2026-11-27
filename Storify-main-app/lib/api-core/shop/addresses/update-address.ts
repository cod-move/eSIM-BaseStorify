import { AddressBook, AddressUpdateRequest } from "@/contracts/mobile/shop/v1/addresses";
import { parseInput } from "@/lib/api-core/input";
import { defineRoute } from "@/lib/api-core/registry";
import { updateAddress } from "@/lib/customers/address-book";
import { AddressSchema } from "@/lib/validations";
import { storedAddressFields, toAddressBook, withAddressFound } from "./app-address";
import { canonicalCountry, withAppCountryError } from "@/lib/esim/checkout/country"; // [esim-patch] P88

/**
 * PATCH /addresses/{id}: the fields sent replace the address's own; the rest
 * stay. The result is checked as a whole, as a new address would be.
 */
export const updateAddressRoute = defineRoute({
  id: "addresses.update",
  method: "PATCH",
  path: "/addresses/{id}",
  auth: "user",
  cache: { kind: "private" },
  rateLimit: { bucket: "addresses:write", preset: "moderate" },
  demo: "default",
  input: AddressUpdateRequest,
  output: AddressBook,
  handler: async ({ input, params, session, locale }) => {
    // [esim-patch] P88 as POST /addresses: the country in the shopper's language, a refusal under the field.
    const change = input.country === undefined ? input : { ...input, country: canonicalCountry(input.country) };
    const addresses = await withAddressFound(() => withAppCountryError(locale, () =>
      updateAddress(
        session.user.id,
        { id: params.id },
        (existing) =>
          parseInput(AddressSchema, {
            ...storedAddressFields(existing),
            ...change,
          }) as ReturnType<typeof AddressSchema.parse>,
      ),
    ));
    return toAddressBook(session.user.id, addresses);
  },
});
