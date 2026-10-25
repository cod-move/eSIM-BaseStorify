import type { ProviderErrorCode } from "@/lib/esim/providers/types";

/**
 * What a fulfilment job does after each supplier answer (ORD-06..09). Pure:
 * the worker applies the returned patch.
 *
 * - rejected (and the supplier-side kinds of refusal): this supplier will not
 *   sell it — fail over to the next candidate at once; none left → failed.
 * - uncertain (timeout, 5xx, unreadable answer): the supplier may have sold
 *   it. Retry the SAME supplier with the SAME idempotency key, backing off;
 *   never fail over, which could buy twice. Still unknowable after
 *   MAX_UNCERTAIN_RETRIES → failed, for a person to check with the supplier.
 * - processing: poll — every 30 s for 5 minutes, then every 2 minutes, for at
 *   most 24 hours.
 */

export const MAX_UNCERTAIN_RETRIES = 6;
const POLL_FAST_MS = 30_000;
const POLL_FAST_FOR_MS = 5 * 60_000;
const POLL_SLOW_MS = 2 * 60_000;
const POLL_GIVE_UP_MS = 24 * 60 * 60_000;
const MAX_BACKOFF_MS = 30 * 60_000;

export interface JobView {
  candidateIndex: number;
  candidateCount: number;
  candidateAttempts: number;
  pendingSince: Date | null;
}

export type Outcome =
  | { kind: "fulfilled" }
  | { kind: "processing"; providerOrderId: string }
  | { kind: "error"; code: ProviderErrorCode | "error"; message: string };

export type Decision =
  | { action: "fulfilled" }
  | { action: "poll"; providerOrderId: string; at: Date; pendingSince: Date }
  | { action: "retry"; at: Date; reason: string }
  | { action: "failover"; candidateIndex: number; reason: string }
  | { action: "fail"; reason: string };

/** Codes meaning "this supplier will not sell this", safe to fail over on. */
const REFUSALS: ReadonlyArray<string> = ["rejected", "not_found", "credentials_missing", "unsupported"];

export function backoffMs(attempt: number): number {
  return Math.min(2 ** Math.max(attempt - 1, 0) * 30_000, MAX_BACKOFF_MS);
}

export function decide(job: JobView, outcome: Outcome, now: Date = new Date()): Decision {
  if (outcome.kind === "fulfilled") return { action: "fulfilled" };

  if (outcome.kind === "processing") {
    const pendingSince = job.pendingSince ?? now;
    const waited = now.getTime() - pendingSince.getTime();
    if (waited >= POLL_GIVE_UP_MS) {
      return { action: "fail", reason: "Supplier accepted the order but delivered nothing for 24 hours" };
    }
    const delay = waited < POLL_FAST_FOR_MS ? POLL_FAST_MS : POLL_SLOW_MS;
    return {
      action: "poll",
      providerOrderId: outcome.providerOrderId,
      at: new Date(now.getTime() + delay),
      pendingSince,
    };
  }

  if (REFUSALS.includes(outcome.code)) {
    const next = job.candidateIndex + 1;
    return next < job.candidateCount
      ? { action: "failover", candidateIndex: next, reason: outcome.message }
      : { action: "fail", reason: `Every supplier refused: ${outcome.message}` };
  }

  const attempt = job.candidateAttempts + 1;
  if (attempt > MAX_UNCERTAIN_RETRIES) {
    return {
      action: "fail",
      reason: `Supplier outcome unknown after ${MAX_UNCERTAIN_RETRIES} retries — check with the supplier before refunding: ${outcome.message}`,
    };
  }
  return { action: "retry", at: new Date(now.getTime() + backoffMs(attempt)), reason: outcome.message };
}

/**
 * Stable per job and plan: retries reuse it, a failover gets a new one. Kept
 * under 50 alphanumerics (eSIM Access's transactionId limit): the job id plus
 * enough of the plan id to tell one job's candidates apart.
 */
export function idempotencyKey(jobId: string, planId: string): string {
  return `esim-${jobId}-${planId.slice(-8)}`;
}
