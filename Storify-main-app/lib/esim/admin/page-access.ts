import "server-only";

import { getAdminTeamAccess, requireAdminPageAccess } from "@/lib/access/admin-page-guard";
import { teamHasAny } from "@/lib/access/team-permissions";
import { ESIM_MANAGE } from "@/lib/esim/admin/permissions";

/** The signed-in admin, and whether their team role may change eSIM settings (the area layout already checked view). */
export async function esimPageAccess(locale: string) {
  const session = await requireAdminPageAccess(locale);
  const access = await getAdminTeamAccess(session.user.id);
  return { session, canManage: teamHasAny(access, ESIM_MANAGE) };
}
