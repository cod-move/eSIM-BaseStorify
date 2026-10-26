import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { validateBody } from "@/lib/api/validate";
import {
  publishDestinationList,
  setDestinationPlans,
  setDestinationVisibility,
  setFeatured,
} from "@/lib/esim/admin/destinations";
import { ESIM_WRITE, auditEsim, runAfterResponse } from "@/lib/esim/admin/route";

const BulkSchema = z.object({
  action: z.enum(["feature", "unfeature", "show", "hide", "plansOn", "plansOff", "publish"]),
  productSlugs: z.array(z.string().min(1).max(120)).min(1).max(500),
  publishStatus: z.enum(["draft", "active"]).default("draft"),
});

/** Most destinations published while the admin waits; more are published after the response. */
const PUBLISH_INLINE = 20;

/** Bulk actions on destinations (ADM-02): featured, shown or hidden, all plans on or off, published. */
export const POST = withApi(ESIM_WRITE, async ({ request, session }) => {
  const { action, productSlugs, publishStatus } = await validateBody(request, BulkSchema);
  await auditEsim(request, session, {
    resourceId: "esim:destinations",
    resourceName: "eSIM destinations",
    summary: `Destinations: ${action} (${productSlugs.length})`,
    after: { action, productSlugs: productSlugs.slice(0, 50) },
  });
  switch (action) {
    case "feature":
    case "unfeature":
      return successResponse(await setFeatured(productSlugs, action === "feature"));
    case "show":
    case "hide":
      return successResponse(await setDestinationVisibility(productSlugs, action === "show"));
    case "plansOn":
    case "plansOff":
      return successResponse(await setDestinationPlans(productSlugs, action === "plansOn" ? "active" : "disabled"));
    case "publish":
      if (productSlugs.length > PUBLISH_INLINE) {
        await runAfterResponse(async () => {
          await publishDestinationList(productSlugs, publishStatus).then(
            () => undefined,
            (error) => console.error("eSIM publish failed:", error),
          );
        });
        return successResponse({ background: true, destinations: productSlugs.length });
      }
      return successResponse({ background: false, destinations: productSlugs.length, result: await publishDestinationList(productSlugs, publishStatus) });
  }
});
