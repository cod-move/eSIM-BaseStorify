import { myNumberQrRoute } from "@/lib/esim/mobile/number-manage";
import { privateRoute } from "@/lib/api-next/routes";

/** A new QR code for a number; see lib/esim/mobile/number-manage.ts. */
export const POST = privateRoute(myNumberQrRoute);
