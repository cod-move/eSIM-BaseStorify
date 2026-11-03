import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { deleteNumberPackage, loadPacketsFromTopConnect, saveNumberPackage, setNumberPackageStatus } from "@/lib/esim/admin/number-packages";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";
import { ProviderError } from "@/lib/esim/providers/types";

const cents = z.number().int().min(0).max(100_000_00);
const id = z.string().max(40);

const PackageSchema = z.object({
  packetId: z.string().trim().regex(/^\d{1,9}$/),
  name: z.string().trim().min(1).max(120),
  validityDays: z.number().int().min(0).max(3650),
  volumeMb: z.number().int().min(1).max(10_000_000).nullable(),
  incrementStepKb: z.number().int().min(1).max(1_000_000).default(1),
  costMinor: cents,
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/),
  countryCodes: z.array(z.string().trim().regex(/^[A-Za-z]{2}$/)).max(300).default([]),
  retailPriceMinor: cents.nullable(),
  status: z.enum(["active", "hidden"]),
  sortOrder: z.number().int().min(0).max(1_000_000).default(0),
});

const NumberPackagesSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), id: id.nullable(), values: PackageSchema }),
  z.object({ action: z.literal("status"), id, status: z.enum(["active", "hidden"]) }),
  z.object({ action: z.literal("delete"), id }),
  z.object({ action: z.literal("load"), msisdn: z.string().trim().regex(/^\d{5,17}$/).optional() }),
]);

/** Number-card data packages (NUM-02): add or change a packet, show or hide it, remove it, or load TopConnect's list. */
export const POST = withApi(ESIM_WRITE, async ({ request, session }) => {
  const body = await validateBody(request, NumberPackagesSchema);
  try {
    if (body.action === "save") {
      const change = await saveNumberPackage(body.id, body.values);
      await auditEsim(request, session, {
        resourceId: `esim:number-package:${change.id}`,
        resourceName: `Data package ${change.packetId}`,
        summary: body.id ? "Changed a number data package" : "Added a number data package",
        before: change.before ?? undefined,
        after: change.after ?? undefined,
      });
      return successResponse({ id: change.id });
    }
    if (body.action === "status") {
      const change = await setNumberPackageStatus(body.id, body.status);
      await auditEsim(request, session, {
        resourceId: `esim:number-package:${body.id}`,
        resourceName: `Data package ${change.packetId}`,
        summary: body.status === "active" ? "Put a number data package on sale" : "Hid a number data package",
        before: { status: change.before },
        after: { status: body.status },
      });
      return successResponse({ ok: true });
    }
    if (body.action === "delete") {
      const removed = await deleteNumberPackage(body.id);
      await auditEsim(request, session, {
        resourceId: `esim:number-package:${body.id}`,
        resourceName: `Data package ${removed.packetId}`,
        summary: "Removed a number data package",
        before: removed,
      });
      return successResponse({ ok: true });
    }
    const report = await loadPacketsFromTopConnect(body.msisdn);
    if (report.added.length || report.updated.length) {
      await auditEsim(request, session, {
        resourceId: "esim:number-packages",
        resourceName: "Number data packages",
        summary: `Loaded TopConnect's packets: ${report.added.length} added, ${report.updated.length} updated`,
        after: { ...report },
      });
    }
    return successResponse(report);
  } catch (error) {
    if (error instanceof ProviderError) throw new ValidationError(`TopConnect: ${error.message}`);
    if (error instanceof Error && /Unknown data package|already on the list|No exchange rate|first/.test(error.message)) throw new ValidationError(error.message);
    throw error;
  }
});
