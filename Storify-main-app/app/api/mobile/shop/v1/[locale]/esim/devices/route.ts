import { esimDevicesRoute } from "@/lib/esim/mobile/devices";
import { publicGet } from "@/lib/api-next/routes";

/** Phones that take an eSIM (APP-05); see lib/esim/mobile/devices.ts. */
export const GET = publicGet(esimDevicesRoute);
