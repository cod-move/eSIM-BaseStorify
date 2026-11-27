import { esimCryptoChooseRoute } from "@/lib/esim/mobile/pay";
import { privateRoute } from "@/lib/api-next/routes";

/** Pays a crypto payment in this coin (APP-09); see lib/esim/mobile/pay.ts. */
export const POST = privateRoute(esimCryptoChooseRoute);
