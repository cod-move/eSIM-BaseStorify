import { myNumberVoucherRoute } from "@/lib/esim/mobile/number-manage";
import { privateRoute } from "@/lib/api-next/routes";

/** A recharge voucher onto a number; see lib/esim/mobile/number-manage.ts. */
export const POST = privateRoute(myNumberVoucherRoute);
