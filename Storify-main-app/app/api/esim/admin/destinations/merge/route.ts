import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { publishDestinationList } from "@/lib/esim/admin/destinations";
import { MergeError, mergeDestination, unmergeDestination } from "@/lib/esim/catalog/merge";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";

const slug = z.string().min(1).max(120);
const MergeSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("merge"), productSlug: slug, into: slug }),
  z.object({ action: z.literal("unmerge"), productSlug: slug }),
]);

/**
 * Merges a destination into another, or undoes it (lib/esim/catalog/merge.ts),
 * then publishes the destinations whose plans moved: the merged one's product
 * goes to draft (or moves over, when the other had none), and its address
 * redirects to the other's.
 */
export const POST = withApi(ESIM_WRITE, async ({ request, session }) => {
  const body = await validateBody(request, MergeSchema);
  let touched: string[];
  try {
    touched = body.action === "merge" ? await mergeDestination(body.productSlug, body.into) : await unmergeDestination(body.productSlug);
  } catch (error) {
    if (error instanceof MergeError) throw new ValidationError(error.message);
    throw error;
  }
  const published = await publishDestinationList(touched, "draft");
  await auditEsim(request, session, {
    resourceId: `esim:destination:${body.productSlug}`,
    resourceName: `eSIM destination ${body.productSlug}`,
    summary: body.action === "merge" ? `Merged the destination into ${body.into}` : "Undid the destination's merge",
    before: {},
    after: { action: body.action, into: body.action === "merge" ? body.into : null, published },
  });
  return successResponse({ touched, published });
});
