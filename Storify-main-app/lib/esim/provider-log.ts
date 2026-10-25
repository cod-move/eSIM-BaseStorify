import "server-only";

import type { Types } from "mongoose";
import { EsimProviderLog } from "@/models/esim-provider-log.model";
import { ProviderError } from "@/lib/esim/providers/types";
import { redact } from "@/lib/esim/redact";

/** Records a supplier call in `EsimProviderLog`, redacted (lib/esim/redact.ts). */

export interface ProviderCallContext {
  provider: Types.ObjectId;
  providerCode: string;
  operation: string;
  refs?: { orderId?: string; esimId?: string; topupId?: string; planId?: string };
  request?: unknown;
}

/**
 * Runs a supplier call and logs it either way. A logging failure never masks
 * the call's own outcome — the call matters, the log is for later.
 */
export async function withProviderLog<T>(
  context: ProviderCallContext,
  call: () => Promise<T>,
  summarize: (result: T) => unknown = (result) => result,
): Promise<T> {
  const started = Date.now();
  try {
    const result = await call();
    await EsimProviderLog.create({
      ...context,
      request: redact(context.request),
      ok: true,
      durationMs: Date.now() - started,
      response: redact(summarize(result)),
    }).catch((error) => console.error("[esim] provider log write failed:", error));
    return result;
  } catch (error) {
    await EsimProviderLog.create({
      ...context,
      request: redact(context.request),
      ok: false,
      durationMs: Date.now() - started,
      errorCode: error instanceof ProviderError ? error.code : "error",
      errorMessage: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
    }).catch((logError) => console.error("[esim] provider log write failed:", logError));
    throw error;
  }
}
