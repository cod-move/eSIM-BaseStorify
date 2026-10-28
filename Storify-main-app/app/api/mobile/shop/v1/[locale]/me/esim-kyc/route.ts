import { esimKycRoute, esimKycSubmitRoute } from "@/lib/esim/mobile/kyc";
import { privateRoute } from "@/lib/api-next/routes";

/** Identity verification (APP-07); see lib/esim/mobile/kyc.ts. */
export const GET = privateRoute(esimKycRoute);
export const POST = privateRoute(esimKycSubmitRoute);
