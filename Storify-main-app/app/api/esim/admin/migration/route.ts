import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { MigrationError, migrationStatus, startMigrationRun } from "@/lib/esim/admin/migration";
import { ESIM_READ, ESIM_WRITE, auditEsim, runAfterResponse } from "@/lib/esim/admin/route";

/** Where the old store is read from, what has been imported, the latest runs (MIG). */
export const GET = withApi(ESIM_READ, async () => successResponse(await migrationStatus()));

const RunSchema = z.object({ apply: z.boolean() });

/** "Check" (apply: false) or "Import" (apply: true); runs after the response. */
export const POST = withApi(ESIM_WRITE, async ({ request, session }) => {
  const { apply } = await validateBody(request, RunSchema);
  let task: () => Promise<void>;
  try {
    task = await startMigrationRun(apply, session.user.email ?? session.user.id);
  } catch (error) {
    if (error instanceof MigrationError) throw new ValidationError(error.message);
    throw error;
  }
  await auditEsim(request, session, {
    resourceId: "esim:migration",
    resourceName: "Old store import",
    summary: apply ? "Started the import from the old store" : "Checked the old store",
    after: { apply },
  });
  await runAfterResponse(task);
  return successResponse({ started: true });
});
