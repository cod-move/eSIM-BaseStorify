import { esimPlanDetailsRoute } from "@/lib/esim/mobile/plan-details";
import { publicGet } from "@/lib/api-next/routes";

/** One plan of an eSIM destination, explained (APP-02); see lib/esim/mobile/plan-details.ts. */
export const GET = publicGet(esimPlanDetailsRoute);
