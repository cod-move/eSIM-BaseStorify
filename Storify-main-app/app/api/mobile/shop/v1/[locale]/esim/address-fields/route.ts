import { esimAddressFieldsRoute } from "@/lib/esim/mobile/address-fields";
import { publicGet } from "@/lib/api-next/routes";

/** The address fields as the store's checkout asks for them (the app's address book); see lib/esim/mobile/address-fields.ts. */
export const GET = publicGet(esimAddressFieldsRoute);
