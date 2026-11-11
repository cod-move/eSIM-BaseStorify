import { myNumberDiagnosticsRoute } from "@/lib/esim/mobile/number-services";
import { privateRoute } from "@/lib/api-next/routes";

/** What the network last saw of a number; see lib/esim/mobile/number-services.ts. */
export const GET = privateRoute(myNumberDiagnosticsRoute);
