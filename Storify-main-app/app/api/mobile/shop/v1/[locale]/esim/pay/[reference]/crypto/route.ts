import { esimCryptoReadRoute, esimCryptoStartRoute } from "@/lib/esim/mobile/pay";
import { privateRoute } from "@/lib/api-next/routes";

/** A crypto payment in the app's own screen (APP-09); see lib/esim/mobile/pay.ts. */
export const GET = privateRoute(esimCryptoReadRoute);
export const POST = privateRoute(esimCryptoStartRoute);
