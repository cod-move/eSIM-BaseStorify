import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
import { deleteSessionCookie, expireCookie, setSessionCookie } from "better-auth/cookies";
import type { NextRequest } from "next/server";
import * as z from "zod";
import { USER_ACCOUNT_STATUS, USER_ROLES } from "@/config/app.config";
import { IMPERSONATION_COOKIE, IMPERSONATION_SECONDS } from "./impersonation-guard";

/**
 * "Sign in as this customer" from the admin customer page (patch P60).
 *
 * Better Auth's own admin plugin has this, but it brings a whole user
 * administration API with it that would bypass Storify's; this is just the
 * two endpoints, done the same way:
 *
 *  - POST /api/auth/esim/impersonate { userId }: a full admin (not a team
 *    member with a narrower role) gets a one-hour session as an active
 *    customer. The admin's own session is kept in a signed cookie, which also
 *    marks the browser so that payments and account changes are refused
 *    (impersonation-guard.ts, proxy.ts). The session row says who opened it
 *    (`impersonatedBy`), which the storefront banner reads.
 *  - POST /api/auth/esim/stop-impersonating: back to the admin's session; the
 *    customer's stand-in session is deleted. The customer's own sessions are
 *    never touched.
 *
 * Both are written to the audit log.
 */
export function esimImpersonation(): BetterAuthPlugin {
  return {
    id: "esim-impersonation",
    schema: {
      session: {
        fields: {
          impersonatedBy: { type: "string", required: false, input: false },
        },
      },
    },
    endpoints: {
      esimImpersonate: createAuthEndpoint(
        "/esim/impersonate",
        { method: "POST", body: z.object({ userId: z.string().min(1) }), requireHeaders: true },
        async (ctx) => {
          const current = await getSessionFromCtx(ctx);
          if (!current) throw new APIError("UNAUTHORIZED");
          if ((current.session as { impersonatedBy?: string | null }).impersonatedBy) {
            throw new APIError("BAD_REQUEST", { message: "Already signed in as a customer. Return to the admin first." });
          }
          const admin = current.user as { id: string; email?: string; role?: string };
          if (admin.role !== USER_ROLES.ADMIN) throw new APIError("FORBIDDEN", { message: "Only admins may sign in as a customer." });
          const { resolveTeamAccess } = await import("@/lib/access/team-permissions");
          if (!(await resolveTeamAccess(admin.id)).fullAccess) {
            throw new APIError("FORBIDDEN", { message: "Only admins with full access may sign in as a customer." });
          }

          const target = (await ctx.context.internalAdapter.findUserById(ctx.body.userId)) as
            | ({ id: string; email: string; role?: string; status?: string } & Record<string, unknown>)
            | null;
          if (!target) throw new APIError("NOT_FOUND", { message: "Customer not found." });
          if ((target.role ?? USER_ROLES.CUSTOMER) !== USER_ROLES.CUSTOMER) {
            throw new APIError("FORBIDDEN", { message: "Only customer accounts can be opened this way." });
          }
          if ((target.status ?? USER_ACCOUNT_STATUS.ACTIVE) !== USER_ACCOUNT_STATUS.ACTIVE) {
            throw new APIError("FORBIDDEN", { message: "This customer's account is not active." });
          }

          const session = await ctx.context.internalAdapter.createSession(
            target.id,
            true,
            { impersonatedBy: admin.id, expiresAt: new Date(Date.now() + IMPERSONATION_SECONDS * 1000) },
            true,
          );
          if (!session) throw new APIError("INTERNAL_SERVER_ERROR", { message: "Could not open the customer's session." });

          const dontRemember = await ctx.getSignedCookie(ctx.context.authCookies.dontRememberToken.name, ctx.context.secret);
          // The admin's token as the browser holds it, which is what the way back must find.
          const cookieToken = await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name, ctx.context.secret);
          const adminToken = typeof cookieToken === "string" && cookieToken ? cookieToken : current.session.token;
          if (!adminToken) throw new APIError("INTERNAL_SERVER_ERROR", { message: "Could not read the admin session to come back to." });
          const marker = ctx.context.createAuthCookie(IMPERSONATION_COOKIE, { maxAge: IMPERSONATION_SECONDS });
          await ctx.setSignedCookie(marker.name, `${adminToken}:${dontRemember || ""}`, ctx.context.secret, marker.attributes);
          deleteSessionCookie(ctx);
          await setSessionCookie(ctx, { session, user: target as never }, true);

          await record(ctx.request, admin, "Signed in as a customer", target);
          return ctx.json({ ok: true, email: target.email });
        },
      ),
      esimStopImpersonating: createAuthEndpoint(
        "/esim/stop-impersonating",
        { method: "POST", requireHeaders: true },
        async (ctx) => {
          const current = await getSessionFromCtx(ctx);
          const marker = ctx.context.createAuthCookie(IMPERSONATION_COOKIE);
          const saved = await ctx.getSignedCookie(marker.name, ctx.context.secret);
          const adminId = (current?.session as { impersonatedBy?: string | null } | undefined)?.impersonatedBy ?? null;
          if (current && !adminId) throw new APIError("BAD_REQUEST", { message: "Not signed in as a customer." });

          if (current) await ctx.context.internalAdapter.deleteSession(current.session.token);
          expireCookie(ctx, marker);

          const [adminToken, dontRemember] = (typeof saved === "string" ? saved : "").split(":");
          const adminSession = adminToken ? await ctx.context.internalAdapter.findSession(adminToken) : null;
          const reason = !adminToken
            ? "no-saved-admin-session"
            : !adminSession
              ? "admin-session-ended"
              : adminSession.session.expiresAt < new Date()
                ? "admin-session-expired"
                : adminId && adminSession.session.userId !== adminId
                  ? "admin-mismatch"
                  : null;
          if (reason || !adminSession) {
            // The admin signs in again; the reason goes back so the banner can say it.
            console.warn("[esim] stop-impersonating: admin session not restored:", reason);
            deleteSessionCookie(ctx);
            return ctx.json({ ok: true, restored: false, reason });
          }
          // The stand-in session was "don't remember me"; the admin's may not have been.
          if (!dontRemember) expireCookie(ctx, ctx.context.authCookies.dontRememberToken);
          await setSessionCookie(ctx, adminSession, !!dontRemember);
          if (current) {
            await record(ctx.request, adminSession.user as { id: string; email?: string; role?: string }, "Returned from a customer's account", current.user as { id: string; email: string });
          }
          return ctx.json({ ok: true, restored: true });
        },
      ),
    },
  };
}

async function record(
  request: Request | undefined,
  admin: { id: string; email?: string; role?: string },
  summary: string,
  customer: { id: string; email: string },
) {
  try {
    const { audit, createAuditContext } = await import("@/lib/audit");
    await audit(createAuditContext(request as NextRequest, { user: admin }), {
      action: "LOGIN",
      resource: "user",
      resourceId: customer.id,
      resourceName: customer.email,
      changes: { summary: `${summary}: ${customer.email}` },
      metadata: { impersonation: true },
    });
  } catch (error) {
    console.error("[esim] impersonation audit failed:", error);
  }
}
