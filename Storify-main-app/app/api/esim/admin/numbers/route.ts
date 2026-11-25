import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { deleteNumbers, importNumbers, repriceNumbers, setNumbersStatus, updateNumber } from "@/lib/esim/admin/numbers";
import { MAX_IMPORT_LINES } from "@/lib/esim/numbers/import";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";

const cents = z.number().int().min(0).max(100_000_00);

const NumbersSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("import"),
    text: z.string().min(1).max(MAX_IMPORT_LINES * 400),
    dialCode: z.string().trim().regex(/^\+?\d{1,4}$/).optional().or(z.literal("")),
    priceMinor: cents,
    premiumMinor: cents.default(0),
    batch: z.string().trim().max(80).optional(),
    dryRun: z.boolean().default(false),
  }),
  z.object({
    action: z.literal("update"),
    id: z.string().max(40),
    priceMinor: cents.optional(),
    salePriceMinor: cents.nullable().optional(),
    premiumMinor: cents.optional(),
    note: z.string().max(500).nullable().optional(),
    status: z.enum(["available", "retired"]).optional(),
  }),
  z.object({
    action: z.literal("reprice"),
    ids: z.array(z.string().max(40)).min(1).max(500),
    priceMinor: cents.optional(),
    salePriceMinor: cents.nullable().optional(),
    premiumMinor: cents.optional(),
  }),
  z.object({ action: z.literal("delete"), ids: z.array(z.string().max(40)).min(1).max(500) }),
  z.object({ action: z.literal("status"), ids: z.array(z.string().max(40)).min(1).max(500), status: z.enum(["available", "retired"]) }),
]);

/** Number-card stock (NUM-01): import a batch (or check one first), change a free number, put unsold ones on or off sale, remove them. */
export const POST = withApi(ESIM_WRITE, async ({ request, session }) => {
  const body = await validateBody(request, NumbersSchema);
  if (body.action === "import") {
    const report = await importNumbers(body.text, {
      dialCode: body.dialCode || undefined,
      priceMinor: body.priceMinor,
      premiumMinor: body.premiumMinor,
      batch: body.batch,
      dryRun: body.dryRun,
    });
    if (!body.dryRun && report.imported) {
      await auditEsim(request, session, {
        resourceId: "esim:numbers",
        resourceName: "Number stock",
        summary: `Imported ${report.imported} numbers${body.batch ? ` (batch ${body.batch})` : ""}`,
        after: { imported: report.imported, existing: report.existing, problems: report.problems.length, batch: body.batch ?? null, priceMinor: body.priceMinor, premiumMinor: body.premiumMinor },
      });
    }
    return successResponse(report);
  }

  try {
    if (body.action === "update") {
      const { id, action: _action, ...update } = body;
      const change = await updateNumber(id, update);
      await auditEsim(request, session, {
        resourceId: `esim:number:${id}`,
        resourceName: `Number +${change.msisdn}`,
        summary: "Changed a stock number",
        before: change.before,
        after: change.after,
      });
      return successResponse({ ok: true });
    }
    if (body.action === "reprice") {
      const change = { priceMinor: body.priceMinor, salePriceMinor: body.salePriceMinor, premiumMinor: body.premiumMinor };
      if (change.priceMinor === undefined && change.salePriceMinor === undefined && change.premiumMinor === undefined) throw new ValidationError("Nothing to change");
      const report = await repriceNumbers(body.ids, change);
      if (report.changed.length) {
        await auditEsim(request, session, {
          resourceId: "esim:numbers",
          resourceName: "Number stock",
          summary: `Repriced ${report.changed.length} numbers`,
          after: { ...change, numbers: report.changed },
        });
      }
      return successResponse({ changed: report.changed.length, discountTooHigh: report.discountTooHigh.length, unavailable: report.unavailable });
    }
    if (body.action === "status") {
      const changed = await setNumbersStatus(body.ids, body.status);
      if (changed.length) {
        await auditEsim(request, session, {
          resourceId: "esim:numbers",
          resourceName: "Number stock",
          summary: `${body.status === "available" ? "Put on sale" : "Took off sale"} ${changed.length} numbers`,
          after: { status: body.status, numbers: changed },
        });
      }
      return successResponse({ changed: changed.length });
    }
    const removed = await deleteNumbers(body.ids);
    if (removed.length) {
      await auditEsim(request, session, {
        resourceId: "esim:numbers",
        resourceName: "Number stock",
        summary: `Removed ${removed.length} unsold numbers`,
        before: { numbers: removed },
      });
    }
    return successResponse({ removed: removed.length });
  } catch (error) {
    if (error instanceof Error && /Only a number|Unknown number|discount price must be below/.test(error.message)) throw new ValidationError(error.message);
    throw error;
  }
});
