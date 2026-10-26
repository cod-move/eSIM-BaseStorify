import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { validateBody } from "@/lib/api/validate";
import { ValidationError } from "@/lib/api/errors";
import { publishDestinations, selectionDestinations, setPlansStatus, type PlanSelection } from "@/lib/esim/admin/plans";
import { ESIM_WRITE, auditEsim, runAfterResponse } from "@/lib/esim/admin/route";

const Filters = z.object({
  provider: z.string().max(40).optional(),
  scope: z.enum(["local", "regional", "global"]).optional(),
  country: z.string().regex(/^[A-Za-z]{2}$/).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  availability: z.enum(["available", "unavailable"]).optional(),
  search: z.string().max(100).optional(),
  productSlug: z.string().max(120).optional(),
});

const BulkSchema = z.object({
  action: z.enum(["activate", "disable", "publish"]),
  ids: z.array(z.string()).max(1000).optional(),
  filters: Filters.optional(),
  /** For "publish": the status a newly created product gets. */
  publishStatus: z.enum(["draft", "active"]).default("draft"),
});

/** Most destinations published while the admin waits; more are published after the response. */
const PUBLISH_INLINE = 20;

/**
 * Switch plans on or off, or publish their destinations as products
 * (ADM-03) — the ticked plans, or every plan the filters match.
 */
export const POST = withApi(ESIM_WRITE, async ({ request, session }) => {
  const body = await validateBody(request, BulkSchema);
  if (!body.ids?.length && !body.filters) throw new ValidationError("Choose plans or a filter");
  const selection: PlanSelection = body.ids?.length ? { ids: body.ids } : { filters: body.filters! };
  const scope = "ids" in selection ? `${selection.ids.length} ticked plans` : `plans matching ${JSON.stringify(selection.filters)}`;

  if (body.action === "publish") {
    const productSlugs = await selectionDestinations(selection);
    await auditEsim(request, session, {
      resourceId: "esim:publish",
      resourceName: "eSIM products",
      summary: `Published ${productSlugs.length} eSIM destinations (${scope})`,
      after: { productSlugs: productSlugs.slice(0, 50), status: body.publishStatus },
    });
    if (productSlugs.length > PUBLISH_INLINE) {
      await runAfterResponse(async () => {
        await publishDestinations({ productSlugs }, body.publishStatus).then(
          () => undefined,
          (error) => console.error("eSIM publish failed:", error),
        );
      });
      return successResponse({ background: true, destinations: productSlugs.length });
    }
    const result = await publishDestinations({ productSlugs }, body.publishStatus);
    return successResponse({ background: false, destinations: productSlugs.length, result });
  }

  const status = body.action === "activate" ? "active" : "disabled";
  const result = await setPlansStatus(selection, status);
  await auditEsim(request, session, {
    resourceId: "esim:plans",
    resourceName: "eSIM plans",
    summary: `${status === "active" ? "Switched on" : "Switched off"} ${result.changed} eSIM plans (${scope})`,
    after: { status, changed: result.changed },
  });
  return successResponse(result);
});
