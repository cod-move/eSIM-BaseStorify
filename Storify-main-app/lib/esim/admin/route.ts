import "server-only";

import { after, type NextRequest } from "next/server";
import { audit, createAuditContext } from "@/lib/audit";
import { ESIM_MANAGE, ESIM_VIEW } from "@/lib/esim/admin/permissions";

/**
 * What the eSIM admin API routes share: who may call them (admins, held to
 * the eSIM team permissions — patch P6), and the audit row every change
 * writes. Storify's audit resources are a fixed list, so eSIM changes are
 * recorded as "settings" changes with an `esim:` resource id.
 */

export const ESIM_READ = {
  auth: "admin" as const,
  teamPermissions: ESIM_VIEW,
  rateLimit: { action: "esim:admin:read", preset: "lenient" as const },
};
export const ESIM_WRITE = {
  auth: "admin" as const,
  teamPermissions: ESIM_MANAGE,
  rateLimit: { action: "esim:admin:write", preset: "moderate" as const },
};

export async function auditEsim(
  request: NextRequest,
  session: { user?: { id?: string; email?: string; role?: string } } | null,
  entry: { resourceId: string; resourceName: string; summary: string; before?: Record<string, unknown>; after?: Record<string, unknown> },
) {
  await audit(createAuditContext(request, session), {
    action: "SETTINGS_CHANGE",
    resource: "settings",
    resourceId: entry.resourceId,
    resourceName: entry.resourceName,
    changes: { before: entry.before, after: entry.after, summary: entry.summary },
  });
}

/** Work that outlives the response (a catalogue sync takes minutes); inline outside a request. */
export async function runAfterResponse(task: () => Promise<void>) {
  try {
    after(task);
  } catch {
    await task();
  }
}
