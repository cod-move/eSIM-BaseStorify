import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { deleteDevice, importBuiltInDevices, saveDevice } from "@/lib/esim/admin/devices";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";

const DeviceSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    id: z.string().max(40).optional(),
    brand: z.string().trim().min(1).max(60),
    model: z.string().trim().min(1).max(120),
    supported: z.boolean().default(true),
    note: z.string().max(300).nullable().optional(),
  }),
  z.object({ action: z.literal("delete"), id: z.string().max(40) }),
  z.object({ action: z.literal("import") }),
]);

/** The device-compatibility list (ADM-11): add or change a model, remove one, import the built-in list. */
export const POST = withApi(ESIM_WRITE, async ({ request, session }) => {
  const body = await validateBody(request, DeviceSchema);
  try {
    if (body.action === "save") await saveDevice(body);
    if (body.action === "delete") await deleteDevice(body.id);
    const result = body.action === "import" ? await importBuiltInDevices() : { ok: true };
    await auditEsim(request, session, {
      resourceId: "esim:devices",
      resourceName: "eSIM device list",
      summary: body.action === "import" ? "Imported the built-in device list" : `Device list: ${body.action}`,
      after: body,
    });
    return successResponse(result);
  } catch (error) {
    if (error instanceof Error && /duplicate key/i.test(error.message)) throw new ValidationError("That model is already in the list");
    throw error;
  }
});
