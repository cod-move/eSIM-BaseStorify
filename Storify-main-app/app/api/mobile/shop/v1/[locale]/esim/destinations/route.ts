import { esimDestinationsRoute } from "@/lib/esim/mobile/destinations";
import { publicGet } from "@/lib/api-next/routes";

/** The eSIM module's destinations (APP-02); see lib/esim/mobile/destinations.ts. */
export const GET = publicGet(esimDestinationsRoute);
