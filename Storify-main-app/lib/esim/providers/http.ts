import { obj } from "./json";
import { ProviderError, type JsonObject } from "./types";

/**
 * The one way adapters reach a provider: a timeout, a response-size cap, and
 * errors that never echo the request (it carries credentials).
 *
 * A network failure or timeout is `uncertain`, not a rejection: for an order
 * or a top-up the provider may already have acted, so the caller must look
 * the operation up again rather than resubmit it.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpRequest {
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** Sent as application/x-www-form-urlencoded instead of a JSON body. */
  form?: Record<string, string>;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 35_000;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export async function requestJson(
  fetcher: FetchLike,
  request: HttpRequest,
): Promise<{ status: number; ok: boolean; body: JsonObject; retryAfterMs: number | null }> {
  const url = new URL(request.url);
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await fetcher(url.toString(), {
      method: request.method,
      headers: {
        Accept: "application/json",
        ...(request.form
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : request.body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
        ...request.headers,
      },
      body: request.form
        ? new URLSearchParams(request.form).toString()
        : request.body !== undefined
          ? JSON.stringify(request.body)
          : undefined,
      signal: AbortSignal.timeout(request.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch {
    throw new ProviderError("uncertain", `Provider request to ${url.pathname} did not complete`);
  }

  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_RESPONSE_BYTES) {
    throw new ProviderError("invalid_response", "Provider response is too large", response.status);
  }
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new ProviderError("uncertain", `Provider response from ${url.pathname} was cut off`, response.status);
  }
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new ProviderError("invalid_response", "Provider response is too large", response.status);
  }

  let body: JsonObject = {};
  if (text.trim()) {
    try {
      body = obj(JSON.parse(text));
    } catch {
      throw new ProviderError("invalid_response", "Provider returned invalid JSON", response.status);
    }
  }
  return { status: response.status, ok: response.ok, body, retryAfterMs: retryAfter(response) };
}

/** Retry-After as seconds or an HTTP date → milliseconds, or null when absent. */
function retryAfter(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(seconds, 0) * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(date - Date.now(), 0);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
