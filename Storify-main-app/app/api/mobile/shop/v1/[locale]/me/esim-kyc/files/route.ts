import { esimKycFileRoute } from "@/lib/esim/mobile/kyc";
import { privateRoute } from "@/lib/api-next/routes";

/** One identity document (APP-07); see lib/esim/mobile/kyc.ts. */
export const POST = privateRoute(esimKycFileRoute);
