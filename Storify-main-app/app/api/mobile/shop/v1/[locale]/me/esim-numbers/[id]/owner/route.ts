import { myNumberOwnerRoute } from "@/lib/esim/mobile/number-manage";
import { privateRoute } from "@/lib/api-next/routes";

/** Moves a number to another account; see lib/esim/mobile/number-manage.ts. */
export const POST = privateRoute(myNumberOwnerRoute);
