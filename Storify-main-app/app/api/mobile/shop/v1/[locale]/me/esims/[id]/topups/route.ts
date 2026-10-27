import { esimTopupsRoute } from "@/lib/esim/mobile/topups";
import { privateRoute } from "@/lib/api-next/routes";

/** The eSIM module's top-up offers (APP-06); see lib/esim/mobile/topups.ts. */
export const GET = privateRoute(esimTopupsRoute);
