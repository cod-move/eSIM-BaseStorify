import type { FetchLike } from "../http";

/** A recorded request, for asserting what an adapter sent. */
export interface SentRequest {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

/**
 * A fake `fetch` answering by "METHOD /path" (query ignored) from a table of
 * handlers; an unmatched request fails the test loudly.
 */
export function fakeFetch(
  routes: Record<
    string,
    (request: SentRequest) => { status?: number; body: unknown; headers?: Record<string, string> }
  >,
): { fetch: FetchLike; sent: SentRequest[] } {
  const sent: SentRequest[] = [];
  const fetch: FetchLike = async (input, init) => {
    const url = new URL(input);
    const request: SentRequest = {
      url,
      method: init?.method ?? "GET",
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
      body: typeof init?.body === "string" ? init.body : null,
    };
    sent.push(request);
    const key = `${request.method} ${url.pathname}`;
    const handler = routes[key];
    if (!handler) throw new Error(`Unexpected request ${key}`);
    const { status = 200, body, headers = {} } = handler(request);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  };
  return { fetch, sent };
}
