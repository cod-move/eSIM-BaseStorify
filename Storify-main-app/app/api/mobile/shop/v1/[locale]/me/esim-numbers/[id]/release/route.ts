import { releaseMyNumberRoute } from "@/lib/esim/mobile/number-manage";
import { privateRoute } from "@/lib/api-next/routes";

/** Gives a number up; see lib/esim/mobile/number-manage.ts. */
export const POST = privateRoute(releaseMyNumberRoute);
