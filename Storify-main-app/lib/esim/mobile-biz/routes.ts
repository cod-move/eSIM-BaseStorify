import "server-only";

import {
  CustomerEmail,
  CustomerEmailList,
  CustomerEmailRequest,
  CustomerEsims,
  EsimAccess,
  EsimActionRequest,
  EsimActionResult,
  EsimDetail,
  EsimJobRunResult,
  EsimList,
  EsimListQuery,
  EsimStatus,
  NumberList,
  NumberListQuery,
  ProblemActionRequest,
  ProblemActionResult,
  ProblemList,
  ProblemListQuery,
  TopupList,
  TopupListQuery,
  type EsimRow,
} from "@/contracts/mobile/biz/v1/esim";
import { ANY_OPERATOR, grantHasPermission, type BizAccessRule } from "@/lib/api-core/biz/access";
import { bizAppAuditContext } from "@/lib/api-core/biz/audit-context";
import { requireCustomer } from "@/lib/api-core/biz/customers/reach";
import { MobileApiError } from "@/lib/api-core/errors";
import { defineBizRoute, type BizRouteEntry } from "@/lib/api-core/registry";
import { nextPageCursor, pageFromCursor } from "@/lib/api-core/shop/page-cursor";
import { toMoney } from "@/lib/api-core/shop/money";
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import { audit } from "@/lib/audit";
import { connectDB, mongoose } from "@/lib/db";
import { getStoreCurrency } from "@/lib/intl/server-currency";
import { sendCustomerEmail, listCustomerEmails } from "@/lib/esim/admin/customer-email";
import { adminCancelEsim, adminRefreshEsim, adminResendEsim, getAdminEsim, listAdminEsims, type AdminEsimRow } from "@/lib/esim/admin/esims";
import { isEsimJob, listJobs, runJobNow } from "@/lib/esim/admin/jobs";
import { listNumbersAdmin } from "@/lib/esim/admin/numbers";
import { ESIM_MANAGE, ESIM_VIEW } from "@/lib/esim/admin/permissions";
import { listAdminProviders } from "@/lib/esim/admin/providers";
import { listQueue } from "@/lib/esim/admin/queue";
import { listTopupsAdmin } from "@/lib/esim/admin/topups";
import { esimFulfilOrder } from "@/lib/esim/fulfillment";
import { settleOrderDelivery } from "@/lib/esim/fulfillment/delivery";
import {
  JobActionError,
  adminFailJob,
  adminMarkRefunded,
  adminRetryJob,
  adminReviewOrder,
} from "@/lib/esim/fulfillment/service";
import { CustomerProfile } from "@/models";
import { EsimNumber } from "@/models/esim-number.model";

/**
 * The business app's eSIM area (`/api/mobile/biz/v1/{locale}/esim/…`,
 * contracts/mobile/biz/v1/esim.ts): the website's eSIM admin readers and
 * actions (lib/esim/admin) in the app's contract. Only the store's own
 * workspace, and only administrators held to the eSIM team permissions, as
 * on the website: View eSIM reads, Manage eSIM acts. Every action writes the
 * same audit row as the website's.
 */

/** Administrators with View or Manage eSIM (an administrator with full access always). */
const ESIM_VIEW_RULE = {
  workspace: "platform",
  permission: { staff: null, vendor: null, team: [...ESIM_VIEW] },
} as const satisfies BizAccessRule;
const ESIM_MANAGE_RULE = {
  workspace: "platform",
  permission: { staff: null, vendor: null, team: [...ESIM_MANAGE] },
} as const satisfies BizAccessRule;

const PAGE_SIZE = 25;
const iso = (value: unknown): string | undefined => (value ? new Date(value as string).toISOString() : undefined);
const text = (value: string | null | undefined): string | undefined => (value ? value : undefined);

function failed(error: unknown): never {
  if (error instanceof JobActionError) throw new MobileApiError(422, "VALIDATION_ERROR", error.message);
  throw error;
}

function notFound(what: string): MobileApiError {
  return new MobileApiError(404, "NOT_FOUND", `${what} not found.`);
}

/**
 * The business app's id of each row's shopper (GET /customers/{id}): an
 * account's user id, or `guest:` and the guest's customer record. A guest row
 * that later became an account's leads to the account.
 */
async function bizCustomerIds(rows: AdminEsimRow[]): Promise<Map<string, string>> {
  const profileIds = [...new Set(rows.filter((row) => !row.userId && row.customerId).map((row) => row.customerId!))];
  const profiles = profileIds.length
    ? await CustomerProfile.find({ _id: { $in: profileIds } })
        .select({ userId: 1 })
        .lean<Array<{ _id: mongoose.Types.ObjectId; userId?: mongoose.Types.ObjectId | null }>>()
    : [];
  const byProfile = new Map(profiles.map((profile) => [String(profile._id), profile.userId ? String(profile.userId) : `guest:${String(profile._id)}`]));
  const ids = new Map<string, string>();
  for (const row of rows) {
    const id = row.userId ?? (row.customerId ? byProfile.get(row.customerId) : undefined);
    if (id) ids.set(row.id, id);
  }
  return ids;
}

function toEsimRow(row: AdminEsimRow, customerId: string | undefined): EsimRow {
  return {
    id: row.id,
    iccid: text(row.iccid),
    simId: row.iccid ? undefined : text(row.simId),
    orderNumber: row.orderNumber,
    orderId: row.orderId,
    customerEmail: text(row.customer),
    customerId,
    plan: row.plan,
    provider: row.providerCode,
    status: row.status,
    statusLabel: row.statusLabel,
    tone: row.tone,
    remainingBytes: row.remainingBytes ?? undefined,
    totalBytes: row.totalBytes ?? undefined,
    fulfilledAt: text(row.fulfilledAt),
    expiresAt: text(row.expiresAt),
  };
}

async function toEsimRows(rows: AdminEsimRow[]): Promise<EsimRow[]> {
  const ids = await bizCustomerIds(rows);
  return rows.map((row) => toEsimRow(row, ids.get(row.id)));
}

/** GET /esim/access: what the operator may do here; the app shows the area only when `view`. */
export const esimAccessRoute = defineBizRoute({
  id: "esim.access",
  method: "GET",
  path: "/esim/access",
  auth: "user",
  workspace: "platform",
  permission: ANY_OPERATOR,
  cache: { kind: "private" },
  rateLimit: { bucket: "biz:esim:read", preset: "lenient" },
  output: EsimAccess,
  handler: async ({ workspace }) => ({
    view: grantHasPermission(workspace, ESIM_VIEW_RULE.permission),
    manage: grantHasPermission(workspace, ESIM_MANAGE_RULE.permission),
  }),
});

/** GET /esim/esims: every issued eSIM, newest first, by ICCID, order number or email. */
export const esimListRoute = defineBizRoute({
  id: "esim.esims.list",
  method: "GET",
  path: "/esim/esims",
  auth: "user",
  ...ESIM_VIEW_RULE,
  cache: { kind: "private" },
  etag: true,
  rateLimit: { bucket: "biz:esim:read", preset: "lenient" },
  input: EsimListQuery,
  output: EsimList,
  handler: async ({ input }) => {
    const page = pageFromCursor(input.cursor);
    const { rows, pagination } = await listAdminEsims(
      { search: input.search, lifecycle: input.lifecycle || undefined },
      { page, pageSize: PAGE_SIZE },
    );
    return { items: await toEsimRows(rows), nextCursor: nextPageCursor(page, pagination.totalPages), total: pagination.total };
  },
});

/** GET /esim/esims/{id}: one eSIM with its packages, supplier calls and fulfilment. */
export const esimDetailRoute = defineBizRoute({
  id: "esim.esims.detail",
  method: "GET",
  path: "/esim/esims/{id}",
  auth: "user",
  ...ESIM_VIEW_RULE,
  cache: { kind: "private" },
  etag: true,
  rateLimit: { bucket: "biz:esim:read", preset: "lenient" },
  output: EsimDetail,
  handler: async ({ params }) => {
    const detail = await getAdminEsim(params.id);
    if (!detail) throw notFound("eSIM");
    const profile = detail.profile;
    const [listed] = (await listAdminEsims({ search: profile.orderNumber }, { pageSize: 100 })).rows.filter((row) => row.id === params.id);
    const row: AdminEsimRow = listed ?? {
      id: params.id,
      iccid: profile.iccid ?? null,
      simId: profile.simId ?? null,
      orderNumber: profile.orderNumber,
      orderId: String(profile.order),
      customer: detail.customer?.email ?? null,
      userId: profile.customer ? String(profile.customer) : null,
      customerId: detail.customer?.customerId ?? null,
      plan: detail.plan?.title ?? "eSIM",
      providerCode: profile.providerCode,
      status: detail.display.status,
      statusLabel: detail.display.label,
      tone: detail.display.tone,
      remainingBytes: profile.usage?.remainingBytes ?? null,
      totalBytes: profile.usage?.totalBytes ?? null,
      fulfilledAt: profile.fulfilledAt ?? null,
      expiresAt: profile.expiresAt ?? null,
    };
    const ids = await bizCustomerIds([row]);
    const job = detail.job as { state?: string; attempts?: number; lastError?: { message?: string } | null } | null;
    const data = detail.plan?.data as { label?: string } | undefined;
    return {
      ...toEsimRow(row, ids.get(row.id)),
      customerName: text(detail.customer?.name),
      providerOrderId: text(profile.providerOrderId),
      lifecycle: text(profile.lifecycle?.status),
      installed: typeof profile.lifecycle?.installed === "boolean" ? profile.lifecycle.installed : undefined,
      topupDeadline: iso(profile.topupDeadline),
      profileExpiresAt: iso(profile.profileExpiresAt),
      planData: text(data?.label),
      validityDays: typeof detail.plan?.validityDays === "number" ? detail.plan.validityDays : undefined,
      destination: text(detail.plan?.destination),
      smdpAddress: text(profile.installation?.smdpAddress),
      remark: text(profile.remark),
      packages: (detail.packages as Array<Record<string, unknown>>).map((pack) => ({
        kind: String(pack.kind),
        status: String(pack.status),
        totalBytes: typeof pack.dataTotalBytes === "number" ? pack.dataTotalBytes : undefined,
        remainingBytes: typeof pack.dataRemainingBytes === "number" ? pack.dataRemainingBytes : undefined,
        validityDays: Number(pack.validityDays ?? 0),
        activatedAt: iso(pack.activatedAt),
        expiresAt: iso(pack.expiresAt),
      })),
      calls: (detail.logs as Array<{ operation: string; ok: boolean; durationMs?: number; errorCode?: string | null; errorMessage?: string | null; createdAt: string }>).map((log) => ({
        operation: log.operation,
        ok: log.ok,
        durationMs: typeof log.durationMs === "number" ? log.durationMs : undefined,
        error: text([log.errorCode, log.errorMessage].filter(Boolean).join(": ")),
        at: iso(log.createdAt)!,
      })),
      fulfilment:
        job && job.state && job.state !== "delivered"
          ? { state: job.state, attempts: job.attempts ?? 0, error: text(job.lastError?.message) }
          : undefined,
    };
  },
});

/** POST /esim/esims/{id}/actions: refresh usage, send the delivery email again, cancel at the supplier. */
export const esimActionRoute = defineBizRoute({
  id: "esim.esims.action",
  method: "POST",
  path: "/esim/esims/{id}/actions",
  auth: "user",
  ...ESIM_MANAGE_RULE,
  cache: { kind: "private" },
  rateLimit: { bucket: "biz:esim:write", preset: "moderate" },
  demo: "block-mutations",
  idempotency: "required",
  input: EsimActionRequest,
  output: EsimActionResult,
  handler: async ({ input, params, session, client, requestId, locale }) => {
    const context = bizAppAuditContext({ session, client, requestId, locale, method: "POST", path: `/esim/esims/${params.id}/actions` });
    const record = (summary: string, after?: Record<string, unknown>) =>
      audit(context, {
        action: "SETTINGS_CHANGE",
        resource: "settings",
        resourceId: `esim:esim:${params.id}`,
        resourceName: `eSIM ${params.id}`,
        changes: { after, summary },
      });
    try {
      if (input.action === "refresh") {
        const result = await adminRefreshEsim(params.id);
        return { ok: result.refreshed, message: text(result.error) };
      }
      if (input.action === "resend") {
        const sent = await adminResendEsim(params.id);
        await record(`Resent the eSIM delivery email from the business app (${sent ? "sent" : "not sent"})`);
        return { ok: Boolean(sent) };
      }
      const result = await adminCancelEsim(params.id);
      await record(`Cancel eSIM at the supplier from the business app: ${result.message}`, result);
      return { ok: result.cancelled, message: result.message };
    } catch (error) {
      if (error instanceof Error && error.message === "Unknown eSIM") throw notFound("eSIM");
      throw error;
    }
  },
});

/** GET /esim/problems: fulfilment that needs a person, by view, with each view's count. */
export const esimProblemsRoute = defineBizRoute({
  id: "esim.problems.list",
  method: "GET",
  path: "/esim/problems",
  auth: "user",
  ...ESIM_VIEW_RULE,
  cache: { kind: "private" },
  etag: true,
  rateLimit: { bucket: "biz:esim:read", preset: "lenient" },
  input: ProblemListQuery,
  output: ProblemList,
  handler: async ({ input }) => {
    const page = pageFromCursor(input.cursor);
    const queue = await listQueue(input.view ?? "attention", { page, pageSize: PAGE_SIZE, search: input.search });
    return {
      items: queue.rows.map((row) => ({
        id: row.id,
        orderId: row.orderId,
        orderNumber: row.orderNumber,
        customerEmail: text(row.customer),
        unit: row.unit,
        state: row.state,
        attempts: row.attempts,
        supplier: text(row.candidates[row.candidateIndex]?.providerCode),
        suppliers: row.candidates.map((candidate) => ({ index: candidate.index, name: candidate.name, provider: candidate.providerCode })),
        error: row.lastError ?? undefined,
        refund: row.refund ? { state: row.refund.state, amount: row.refund.amount, note: text(row.refund.note) } : undefined,
        reviewReasons: row.review && !row.review.decision ? row.review.reasons : [],
        balanceHoldUntil: row.balanceHold?.until,
        nextAttemptAt: text(row.nextAttemptAt),
        createdAt: row.createdAt,
        history: row.history.map((entry) => ({ at: entry.at, event: entry.event, detail: text(entry.detail) })),
      })),
      nextCursor: nextPageCursor(page, queue.pagination.totalPages),
      counts: queue.counts,
    };
  },
});

/**
 * POST /esim/problems/{id}/actions: as the website's Problems page. Trying
 * again buys after the answer; giving up settles the order (the shopper is
 * refunded as the order allows).
 */
export const esimProblemActionRoute = defineBizRoute({
  id: "esim.problems.action",
  method: "POST",
  path: "/esim/problems/{id}/actions",
  auth: "user",
  ...ESIM_MANAGE_RULE,
  cache: { kind: "private" },
  rateLimit: { bucket: "biz:esim:write", preset: "moderate" },
  demo: "block-mutations",
  idempotency: "required",
  input: ProblemActionRequest,
  output: ProblemActionResult,
  handler: async ({ input, params, session, client, requestId, locale, defer }) => {
    if (!mongoose.isValidObjectId(params.id)) throw notFound("Fulfilment");
    const actor = session.user.email ?? session.user.id;
    let result: { orderId: string };
    try {
      switch (input.action) {
        case "retry":
          result = await adminRetryJob(params.id, { actor });
          break;
        case "switch":
          result = await adminRetryJob(params.id, { candidateIndex: input.candidateIndex, actor });
          break;
        case "fail":
          result = await adminFailJob(params.id, actor);
          break;
        case "refunded":
          result = await adminMarkRefunded(params.id, input.note ?? "", actor);
          break;
        case "approve":
          result = await adminReviewOrder(params.id, "approved", actor);
          break;
        case "reject":
          result = await adminReviewOrder(params.id, "rejected", actor);
          break;
      }
    } catch (error) {
      failed(error);
    }
    await audit(
      bizAppAuditContext({ session, client, requestId, locale, method: "POST", path: `/esim/problems/${params.id}/actions` }),
      {
        action: "SETTINGS_CHANGE",
        resource: "settings",
        resourceId: `esim:job:${params.id}`,
        resourceName: `eSIM fulfilment ${params.id}`,
        changes: { after: { ...input, orderId: result.orderId }, summary: `eSIM fulfilment from the business app: ${input.action}` },
      },
    );
    const orderId = result.orderId;
    if (input.action === "retry" || input.action === "switch" || input.action === "approve") {
      defer(() => esimFulfilOrder(orderId).then(() => undefined, (error) => console.error("eSIM retry failed:", error)));
    } else if (input.action !== "refunded") {
      defer(() => settleOrderDelivery(orderId).then(() => undefined, (error) => console.error("eSIM settlement failed:", error)));
    }
    return { orderId };
  },
});

/** GET /esim/status: problem counts, the scheduled jobs and the suppliers. */
export const esimStatusRoute = defineBizRoute({
  id: "esim.status",
  method: "GET",
  path: "/esim/status",
  auth: "user",
  ...ESIM_VIEW_RULE,
  cache: { kind: "private" },
  etag: true,
  rateLimit: { bucket: "biz:esim:read", preset: "lenient" },
  output: EsimStatus,
  handler: async () => {
    const [queue, topups, jobs, providers] = await Promise.all([
      listQueue("attention", { pageSize: 10 }),
      listTopupsAdmin("attention", { pageSize: 10 }),
      listJobs(),
      listAdminProviders(),
    ]);
    return {
      problems: queue.counts,
      topupProblems: topups.counts.attention,
      jobs: jobs.map((job) => ({
        job: job.job,
        schedule: job.schedule,
        lastRunAt: text(job.lastRunAt),
        lastStatus: text(job.lastStatus),
        lastError: text(job.lastError),
        consecutiveFailures: job.consecutiveFailures,
        stale: job.stale,
      })),
      // Suppliers set up here: active, or with plans from an earlier sync.
      suppliers: providers
        .filter((provider) => provider.status === "active" || provider.plans.total > 0)
        .map((provider) => ({
          code: provider.code,
          name: provider.name,
          active: provider.status === "active",
          plansAvailable: provider.plans.available,
          lastSyncAt: text(provider.lastSync?.finishedAt ?? provider.lastSync?.startedAt),
          lastSyncStatus: text(provider.lastSync?.status),
          lastSyncError: text(provider.lastSync?.error),
          lastProbeOk: provider.lastProbe?.ok,
          lastProbeMessage: text(provider.lastProbe?.message),
        })),
    };
  },
});

/** POST /esim/status/jobs/{job}: run an eSIM scheduled job now; it runs after the answer. */
export const esimJobRunRoute = defineBizRoute({
  id: "esim.jobs.run",
  method: "POST",
  path: "/esim/status/jobs/{job}",
  auth: "user",
  ...ESIM_MANAGE_RULE,
  cache: { kind: "private" },
  rateLimit: { bucket: "biz:esim:write", preset: "moderate" },
  demo: "block-mutations",
  output: EsimJobRunResult,
  handler: async ({ params, session, client, requestId, locale, defer }) => {
    const job = params.job;
    if (!isEsimJob(job)) throw notFound("Job");
    await audit(
      bizAppAuditContext({ session, client, requestId, locale, method: "POST", path: `/esim/status/jobs/${job}` }),
      {
        action: "SETTINGS_CHANGE",
        resource: "settings",
        resourceId: `esim:job-run:${job}`,
        resourceName: `eSIM job ${job}`,
        changes: { summary: `Ran the ${job} job by hand from the business app` },
      },
    );
    defer(async () => {
      const result = await runJobNow(job);
      if (!result.ok) console.error(`eSIM job ${job} failed:`, result.error);
    });
    return { started: true };
  },
});

/** GET /esim/topups: top-ups bought for eSIMs, by view. */
export const esimTopupsRoute = defineBizRoute({
  id: "esim.topups.list",
  method: "GET",
  path: "/esim/topups",
  auth: "user",
  ...ESIM_VIEW_RULE,
  cache: { kind: "private" },
  etag: true,
  rateLimit: { bucket: "biz:esim:read", preset: "lenient" },
  input: TopupListQuery,
  output: TopupList,
  handler: async ({ input }) => {
    const page = pageFromCursor(input.cursor);
    const [list, currency] = await Promise.all([
      listTopupsAdmin(input.view ?? "all", { page, pageSize: PAGE_SIZE, search: input.search }),
      getStoreCurrency(),
    ]);
    return {
      items: list.rows.map((row) => ({
        id: row.id,
        orderId: row.orderId,
        orderNumber: row.orderNumber,
        customerEmail: text(row.customer),
        esimId: text(row.esimId),
        iccid: text(row.iccid),
        name: row.name,
        provider: row.providerCode,
        price: toMoney(row.priceMinor / 100, currency),
        state: row.state,
        attempts: row.attempts,
        error: text(row.lastError?.message),
        refundState: text(row.refund?.state),
        createdAt: row.createdAt,
        completedAt: text(row.completedAt),
      })),
      nextCursor: nextPageCursor(page, list.pagination.totalPages),
      counts: list.counts,
    };
  },
});

/** GET /esim/numbers: the phone numbers in stock, held, sold or retired. */
export const esimNumbersRoute = defineBizRoute({
  id: "esim.numbers.list",
  method: "GET",
  path: "/esim/numbers",
  auth: "user",
  ...ESIM_VIEW_RULE,
  cache: { kind: "private" },
  etag: true,
  rateLimit: { bucket: "biz:esim:read", preset: "lenient" },
  input: NumberListQuery,
  output: NumberList,
  handler: async ({ input }) => {
    const page = pageFromCursor(input.cursor);
    const list = await listNumbersAdmin({ status: input.status ?? "all", search: input.search, page });
    return {
      items: list.rows.map((row) => ({
        id: row.id,
        msisdn: row.msisdn,
        country: text(row.country),
        iccid: row.iccid,
        status: row.status,
        customerEmail: text(row.customer),
        price: toMoney((row.priceMinor + row.premiumMinor) / 100, list.currency),
        reservedUntil: text(row.reservedUntil),
        soldAt: text(row.soldAt),
        batch: text(row.batch),
        note: text(row.note),
      })),
      nextCursor: nextPageCursor(page, list.pages),
      counts: list.counts,
    };
  },
});

/** The customer's record the website's customer page (and its emails) hang on. */
async function customerProfileIdOf(ref: { kind: "account"; userId: string } | { kind: "guest"; profileId: string }): Promise<string | null> {
  if (ref.kind === "guest") return ref.profileId;
  await connectDB();
  const profile = await CustomerProfile.findOne({ userId: new mongoose.Types.ObjectId(ref.userId) })
    .select({ _id: 1 })
    .lean<{ _id: mongoose.Types.ObjectId } | null>();
  return profile ? String(profile._id) : null;
}

/** GET /esim/customers/{id}/esims: one customer's eSIMs (also those bought as a guest with their email) and number cards. */
export const esimCustomerEsimsRoute = defineBizRoute({
  id: "esim.customers.esims",
  method: "GET",
  path: "/esim/customers/{id}/esims",
  auth: "user",
  ...ESIM_VIEW_RULE,
  cache: { kind: "private" },
  etag: true,
  rateLimit: { bucket: "biz:esim:read", preset: "lenient" },
  output: CustomerEsims,
  handler: async ({ params, session, workspace, scope }) => {
    const { customer } = await requireCustomer(params.id, { session, workspace, scope });
    const userId = customer.ref.kind === "account" ? customer.ref.userId : null;
    const [list, numbers] = await Promise.all([
      listAdminEsims({ owner: { userId, email: customer.email ?? null } }, { pageSize: 100 }),
      userId
        ? EsimNumber.find({ customer: new mongoose.Types.ObjectId(userId) })
            .sort({ soldAt: -1 })
            .limit(100)
            .select({ msisdn: 1, iccid: 1, status: 1, soldAt: 1, card: 1 })
            .lean()
        : [],
    ]);
    return {
      esims: await toEsimRows(list.rows),
      total: list.pagination.total,
      numbers: numbers.map((number) => ({
        id: String(number._id),
        msisdn: number.msisdn,
        iccid: number.iccid,
        status: number.status,
        balance:
          typeof number.card?.balanceMinor === "number" && number.card.currency
            ? toMoney(number.card.balanceMinor / 100, number.card.currency)
            : undefined,
        blocked: typeof number.card?.blocked === "boolean" ? number.card.blocked : undefined,
        soldAt: iso(number.soldAt),
      })),
    };
  },
});

function toCustomerEmail(row: Awaited<ReturnType<typeof listCustomerEmails>>[number]) {
  return {
    id: row.id,
    to: row.to,
    subject: row.subject,
    message: row.message,
    status: row.status,
    error: text(row.error),
    sentBy: text(row.sentByEmail),
    createdAt: row.createdAt,
    sentAt: text(row.sentAt),
  };
}

/** GET /esim/customers/{id}/emails: the emails written to this customer by hand, newest first. */
export const esimCustomerEmailsRoute = defineBizRoute({
  id: "esim.customers.emails.list",
  method: "GET",
  path: "/esim/customers/{id}/emails",
  auth: "user",
  ...ESIM_VIEW_RULE,
  cache: { kind: "private" },
  etag: true,
  rateLimit: { bucket: "biz:esim:read", preset: "lenient" },
  output: CustomerEmailList,
  handler: async ({ params, session, workspace, scope }) => {
    const { customer } = await requireCustomer(params.id, { session, workspace, scope });
    const profileId = await customerProfileIdOf(customer.ref);
    return { items: profileId ? (await listCustomerEmails(profileId)).map(toCustomerEmail) : [] };
  },
});

/**
 * POST /esim/customers/{id}/emails: a plain-text email to the customer, to
 * the address the store has for them (never one the app sends). Sent once per
 * `Idempotency-Key`: a retry answers the email already queued.
 */
export const esimCustomerEmailSendRoute = defineBizRoute({
  id: "esim.customers.emails.send",
  method: "POST",
  path: "/esim/customers/{id}/emails",
  auth: "user",
  ...ESIM_MANAGE_RULE,
  cache: { kind: "private" },
  status: 201,
  rateLimit: { bucket: "biz:esim:email", preset: "moderate" },
  demo: "block-mutations",
  idempotency: "required",
  input: CustomerEmailRequest,
  output: CustomerEmail,
  handler: async ({ input, params, session, workspace, scope, client, requestId, locale }) => {
    const { customer } = await requireCustomer(params.id, { session, workspace, scope });
    const profileId = await customerProfileIdOf(customer.ref);
    if (!profileId) throw new MobileApiError(422, "VALIDATION_ERROR", "This customer has no customer record to email.");
    const key = client.idempotencyKey ?? `${Date.now()}`;
    let sent;
    try {
      sent = await sendCustomerEmail({
        profileId,
        subject: input.subject,
        message: input.message,
        requestId: `biz:${key}`,
        admin: { id: session.user.id, email: session.user.email },
      });
    } catch (error) {
      if (error instanceof ValidationError) throw new MobileApiError(422, "VALIDATION_ERROR", error.message);
      if (error instanceof NotFoundError) throw notFound("Customer");
      throw error;
    }
    if (sent.created) {
      await audit(
        bizAppAuditContext({ session, client, requestId, locale, method: "POST", path: `/esim/customers/${params.id}/emails` }),
        {
          action: "SETTINGS_CHANGE",
          resource: "settings",
          resourceId: `esim:customer-email:${profileId}`,
          resourceName: `Email to ${sent.row.to}`,
          changes: { after: { subject: input.subject, status: sent.row.status }, summary: `Emailed the customer from the business app: ${input.subject}` },
        },
      );
    }
    return toCustomerEmail(sent.row);
  },
});

/** Every eSIM endpoint of the business app, for anything that lists the API. */
export const esimBizRoutes: readonly BizRouteEntry[] = [
  esimAccessRoute,
  esimListRoute,
  esimDetailRoute,
  esimActionRoute,
  esimProblemsRoute,
  esimProblemActionRoute,
  esimStatusRoute,
  esimJobRunRoute,
  esimTopupsRoute,
  esimNumbersRoute,
  esimCustomerEsimsRoute,
  esimCustomerEmailsRoute,
  esimCustomerEmailSendRoute,
];
