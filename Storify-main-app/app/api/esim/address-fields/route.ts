import { NextResponse } from "next/server";
import { storeAddressFields } from "@/lib/esim/checkout/address-fields";

/** GET /api/esim/address-fields: the address fields as the store's checkout asks for them (the website's address book). */
export async function GET() {
  return NextResponse.json({ fields: await storeAddressFields() }, { headers: { "Cache-Control": "public, max-age=60" } });
}
