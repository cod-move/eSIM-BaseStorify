import { esimDestinationRoute } from "@/lib/esim/mobile/destinations";
import { publicGet } from "@/lib/api-next/routes";

/** One eSIM destination with its plans (APP-02); see lib/esim/mobile/destinations.ts. */
export const GET = publicGet(esimDestinationRoute);
