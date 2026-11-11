import { myNumberStatementRoute } from "@/lib/esim/mobile/number-manage";
import { privateRoute } from "@/lib/api-next/routes";

/** A number's phone bill (PDF); see lib/esim/mobile/number-manage.ts. */
export const GET = privateRoute(myNumberStatementRoute);
