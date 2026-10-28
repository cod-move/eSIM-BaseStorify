import { EsimDevices } from "@/contracts/mobile/shop/v1/esim";
import { defineRoute } from "@/lib/api-core/registry";
import { connectDB } from "@/lib/db";
import { deviceList } from "@/lib/esim/admin/devices";

/** GET /esim/devices: the website's device table (APP-05), cached and cleared with the storefront. */
export const esimDevicesRoute = defineRoute({
  id: "esim.devices.list",
  method: "GET",
  path: "/esim/devices",
  auth: "none",
  cache: { kind: "public", sMaxAge: 3600, swr: 7200 },
  rateLimit: { bucket: "catalog:esim-devices", preset: "browse" },
  output: EsimDevices,
  handler: async () => {
    await connectDB();
    const brands = await deviceList();
    return {
      brands: brands.map((entry) => ({
        brand: entry.brand,
        models: entry.models.map((model) => ({
          name: model.name,
          supported: model.supported !== false,
          ...(model.note ? { note: model.note } : {}),
        })),
      })),
    };
  },
});
