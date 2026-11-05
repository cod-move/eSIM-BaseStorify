import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { validateBody } from "@/lib/api/validate";
import { setDestinationNames } from "@/lib/esim/admin/destinations";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";

const NamesSchema = z.object({
  productSlug: z.string().min(1).max(120),
  names: z.record(z.string().regex(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/), z.string().max(80)),
});

/** Saves a destination's name in each language (WEB-01); an empty one goes back to the automatic name. */
export const POST = withApi(ESIM_WRITE, async ({ request, session }) => {
  const body = await validateBody(request, NamesSchema);
  const result = await setDestinationNames(body.productSlug, body.names);
  await auditEsim(request, session, {
    resourceId: `esim:destination:${body.productSlug}`,
    resourceName: `eSIM destination ${body.productSlug}`,
    summary: "Changed the destination's names by language",
    before: result.before,
    after: result.after,
  });
  return successResponse(result.after);
});
