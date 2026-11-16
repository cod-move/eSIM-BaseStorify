/**
 * The eSIM module's part of the business app contract (`/api/mobile/biz/v1/{locale}/esim/…`):
 * what the store's administrators see and do about eSIMs from the app. Not
 * in `index.ts` (an official file): imported by path, and copied to the
 * business app as it is (`src/contracts/mobile/biz/v1/esim.ts`).
 *
 * Who: administrators of the store's own workspace, held to the eSIM team
 * permissions (View eSIM to read, Manage eSIM to act), as the website's
 * eSIM admin. GET /esim/access says which, so the app shows only what works.
 *
 * Follows the folder's rules (./common.ts): only zod, optional fields left
 * out rather than null, words the server owns passed through as they are.
 */
import * as z from "zod";
import { listOf, Money } from "./common";

/** GET /esim/access: what this operator may do in the eSIM area. */
export const EsimAccess = z.object({
  view: z.boolean(),
  manage: z.boolean(),
});
export type EsimAccess = z.infer<typeof EsimAccess>;

/** neutral / info / success / warning / danger, as the website's status chips. */
export const EsimTone = z.string();

/** One eSIM in a list. */
export const EsimRow = z.object({
  id: z.string(),
  /** The card's ICCID; a supplier that masks it (Stellar) leaves `simId` instead. */
  iccid: z.string().optional(),
  simId: z.string().optional(),
  orderNumber: z.string(),
  orderId: z.string(),
  /** The shopper's email. */
  customerEmail: z.string().optional(),
  /** The business app's id of the shopper (GET /customers/{id}), when the store has a record of them. */
  customerId: z.string().optional(),
  plan: z.string(),
  provider: z.string(),
  /** The shopper-facing status: ready_to_install, in_use, data_used_up, expired… */
  status: z.string(),
  statusLabel: z.string(),
  tone: EsimTone,
  remainingBytes: z.number().optional(),
  totalBytes: z.number().optional(),
  fulfilledAt: z.string().optional(),
  expiresAt: z.string().optional(),
});
export type EsimRow = z.infer<typeof EsimRow>;

/** GET /esim/esims: by ICCID, order number or email, and by the supplier's lifecycle status. */
export const EsimListQuery = z.object({
  cursor: z.string().optional(),
  search: z.string().max(100).optional(),
  /** not_installed, installed, in_use, depleted, expired, cancelled. */
  lifecycle: z.string().max(40).optional(),
});
export type EsimListQuery = z.infer<typeof EsimListQuery>;

export const EsimList = listOf(EsimRow).extend({ total: z.number() });
export type EsimList = z.infer<typeof EsimList>;

/** One data package on the eSIM: the first one, then each top-up. */
export const EsimPackage = z.object({
  kind: z.string(),
  status: z.string(),
  totalBytes: z.number().optional(),
  remainingBytes: z.number().optional(),
  validityDays: z.number(),
  activatedAt: z.string().optional(),
  expiresAt: z.string().optional(),
});
export type EsimPackage = z.infer<typeof EsimPackage>;

/** One call to the supplier about this eSIM, newest first. */
export const EsimSupplierCall = z.object({
  operation: z.string(),
  ok: z.boolean(),
  durationMs: z.number().optional(),
  error: z.string().optional(),
  at: z.string(),
});
export type EsimSupplierCall = z.infer<typeof EsimSupplierCall>;

/** GET /esim/esims/{id}. */
export const EsimDetail = EsimRow.extend({
  customerName: z.string().optional(),
  providerOrderId: z.string().optional(),
  lifecycle: z.string().optional(),
  installed: z.boolean().optional(),
  topupDeadline: z.string().optional(),
  profileExpiresAt: z.string().optional(),
  plan: z.string(),
  planData: z.string().optional(),
  validityDays: z.number().optional(),
  destination: z.string().optional(),
  smdpAddress: z.string().optional(),
  remark: z.string().optional(),
  packages: z.array(EsimPackage),
  calls: z.array(EsimSupplierCall),
  /** The fulfilment job, while it says something (failed, being retried). */
  fulfilment: z
    .object({
      state: z.string(),
      attempts: z.number(),
      error: z.string().optional(),
    })
    .optional(),
});
export type EsimDetail = z.infer<typeof EsimDetail>;

/** POST /esim/esims/{id}/actions (Manage eSIM). */
export const EsimActionRequest = z.object({
  action: z.enum(["refresh", "resend", "cancel"]),
});
export type EsimActionRequest = z.infer<typeof EsimActionRequest>;

export const EsimActionResult = z.object({
  ok: z.boolean(),
  message: z.string().optional(),
});
export type EsimActionResult = z.infer<typeof EsimActionResult>;

/** Problems: the fulfilment jobs that need a person (the website's eSIM → Problems). */
export const PROBLEM_VIEWS = ["attention", "review", "balance", "failed", "stuck", "all"] as const;
export const ProblemView = z.enum(PROBLEM_VIEWS);
export type ProblemView = z.infer<typeof ProblemView>;

export const ProblemListQuery = z.object({
  cursor: z.string().optional(),
  view: ProblemView.optional(),
  /** Order number. */
  search: z.string().max(100).optional(),
});
export type ProblemListQuery = z.infer<typeof ProblemListQuery>;

export const ProblemRow = z.object({
  id: z.string(),
  orderId: z.string(),
  orderNumber: z.string(),
  customerEmail: z.string().optional(),
  /** The order line, with the unit when it bought several. */
  unit: z.string(),
  /** queued / purchasing / provider_pending / review / failed / delivered… */
  state: z.string(),
  attempts: z.number(),
  /** The supplier being tried, of `suppliers`. */
  supplier: z.string().optional(),
  suppliers: z.array(z.object({ index: z.number(), name: z.string(), provider: z.string() })),
  error: z.object({ code: z.string(), message: z.string(), at: z.string() }).optional(),
  refund: z.object({ state: z.string(), amount: z.number(), note: z.string().optional() }).optional(),
  reviewReasons: z.array(z.string()),
  /** Waiting for a supplier top-up, until then. */
  balanceHoldUntil: z.string().optional(),
  nextAttemptAt: z.string().optional(),
  createdAt: z.string(),
  history: z.array(z.object({ at: z.string(), event: z.string(), detail: z.string().optional() })),
});
export type ProblemRow = z.infer<typeof ProblemRow>;

export const ProblemCounts = z.object({
  attention: z.number(),
  review: z.number(),
  balance: z.number(),
  failed: z.number(),
  stuck: z.number(),
});
export type ProblemCounts = z.infer<typeof ProblemCounts>;

export const ProblemList = listOf(ProblemRow).extend({ counts: ProblemCounts });
export type ProblemList = z.infer<typeof ProblemList>;

/**
 * POST /esim/problems/{id}/actions (Manage eSIM): try again (`switch` to
 * another supplier of the job's), give up (the shopper is refunded as the
 * order allows), record a refund made by hand, or decide an order held for
 * review.
 */
export const ProblemActionRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("retry") }),
  z.object({ action: z.literal("switch"), candidateIndex: z.number().int().min(0) }),
  z.object({ action: z.literal("fail") }),
  z.object({ action: z.literal("refunded"), note: z.string().max(200).optional() }),
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject") }),
]);
export type ProblemActionRequest = z.infer<typeof ProblemActionRequest>;

export const ProblemActionResult = z.object({ orderId: z.string() });
export type ProblemActionResult = z.infer<typeof ProblemActionResult>;

/** GET /esim/status: whether the eSIM machinery runs. */
export const EsimJob = z.object({
  job: z.string(),
  schedule: z.string(),
  lastRunAt: z.string().optional(),
  lastStatus: z.string().optional(),
  lastError: z.string().optional(),
  consecutiveFailures: z.number(),
  /** Not run within its allowance: the scheduler is not calling it. */
  stale: z.boolean(),
});
export type EsimJob = z.infer<typeof EsimJob>;

export const EsimSupplier = z.object({
  code: z.string(),
  name: z.string(),
  active: z.boolean(),
  plansAvailable: z.number(),
  lastSyncAt: z.string().optional(),
  lastSyncStatus: z.string().optional(),
  lastSyncError: z.string().optional(),
  lastProbeOk: z.boolean().optional(),
  lastProbeMessage: z.string().optional(),
});
export type EsimSupplier = z.infer<typeof EsimSupplier>;

export const EsimStatus = z.object({
  problems: ProblemCounts,
  topupProblems: z.number(),
  jobs: z.array(EsimJob),
  suppliers: z.array(EsimSupplier),
});
export type EsimStatus = z.infer<typeof EsimStatus>;

/** POST /esim/status/jobs/{job} (Manage eSIM): run a scheduled job now; it runs after the answer. */
export const EsimJobRunResult = z.object({ started: z.boolean() });
export type EsimJobRunResult = z.infer<typeof EsimJobRunResult>;

/** Top-ups bought for eSIMs. */
export const TOPUP_VIEWS = ["attention", "failed", "stuck", "completed", "all"] as const;
export const TopupView = z.enum(TOPUP_VIEWS);
export type TopupView = z.infer<typeof TopupView>;

export const TopupListQuery = z.object({
  cursor: z.string().optional(),
  view: TopupView.optional(),
  /** Order number, ICCID or the shopper's email. */
  search: z.string().max(100).optional(),
});
export type TopupListQuery = z.infer<typeof TopupListQuery>;

export const TopupRow = z.object({
  id: z.string(),
  orderId: z.string(),
  orderNumber: z.string(),
  customerEmail: z.string().optional(),
  esimId: z.string().optional(),
  iccid: z.string().optional(),
  name: z.string(),
  provider: z.string(),
  price: Money,
  state: z.string(),
  attempts: z.number(),
  error: z.string().optional(),
  refundState: z.string().optional(),
  createdAt: z.string(),
  completedAt: z.string().optional(),
});
export type TopupRow = z.infer<typeof TopupRow>;

export const TopupList = listOf(TopupRow).extend({
  counts: z.object({ attention: z.number(), failed: z.number(), stuck: z.number() }),
});
export type TopupList = z.infer<typeof TopupList>;

/** Phone numbers (TopConnect number cards). */
export const NUMBER_STATUSES = ["all", "available", "reserved", "sold", "retired"] as const;
export const NumberStatusFilter = z.enum(NUMBER_STATUSES);
export type NumberStatusFilter = z.infer<typeof NumberStatusFilter>;

export const NumberListQuery = z.object({
  cursor: z.string().optional(),
  status: NumberStatusFilter.optional(),
  /** Number, ICCID, batch or the customer's email. */
  search: z.string().max(100).optional(),
});
export type NumberListQuery = z.infer<typeof NumberListQuery>;

export const NumberRow = z.object({
  id: z.string(),
  msisdn: z.string(),
  country: z.string().optional(),
  iccid: z.string(),
  status: z.string(),
  customerEmail: z.string().optional(),
  price: Money,
  reservedUntil: z.string().optional(),
  soldAt: z.string().optional(),
  batch: z.string().optional(),
  note: z.string().optional(),
});
export type NumberRow = z.infer<typeof NumberRow>;

export const NumberList = listOf(NumberRow).extend({
  counts: z.object({ available: z.number(), reserved: z.number(), sold: z.number(), retired: z.number() }),
});
export type NumberList = z.infer<typeof NumberList>;

/** GET /esim/customers/{id}/esims: one customer's eSIMs (account and guest ones by email) and number cards. */
export const CustomerNumber = z.object({
  id: z.string(),
  msisdn: z.string(),
  iccid: z.string(),
  status: z.string(),
  balance: Money.optional(),
  blocked: z.boolean().optional(),
  soldAt: z.string().optional(),
});
export type CustomerNumber = z.infer<typeof CustomerNumber>;

export const CustomerEsims = z.object({
  esims: z.array(EsimRow),
  total: z.number(),
  numbers: z.array(CustomerNumber),
});
export type CustomerEsims = z.infer<typeof CustomerEsims>;

/** An email written to the customer by hand (plain text; links become links). */
export const CUSTOMER_EMAIL_SUBJECT_MAX = 200;
export const CUSTOMER_EMAIL_MESSAGE_MAX = 10000;

export const CustomerEmail = z.object({
  id: z.string(),
  to: z.string(),
  subject: z.string(),
  message: z.string(),
  /** queued / sending / retrying / sent / failed / cancelled / unconfigured. */
  status: z.string(),
  error: z.string().optional(),
  sentBy: z.string().optional(),
  createdAt: z.string(),
  sentAt: z.string().optional(),
});
export type CustomerEmail = z.infer<typeof CustomerEmail>;

/** GET /esim/customers/{id}/emails, newest first. */
export const CustomerEmailList = z.object({ items: z.array(CustomerEmail) });
export type CustomerEmailList = z.infer<typeof CustomerEmailList>;

/** POST /esim/customers/{id}/emails (Manage eSIM): sent once per `Idempotency-Key`. */
export const CustomerEmailRequest = z.object({
  subject: z.string().trim().min(1).max(CUSTOMER_EMAIL_SUBJECT_MAX),
  message: z.string().trim().min(1).max(CUSTOMER_EMAIL_MESSAGE_MAX),
});
export type CustomerEmailRequest = z.infer<typeof CustomerEmailRequest>;
