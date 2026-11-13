/**
 * `fetch` for a form that carries a file, on the phone (patch P68).
 *
 * Expo installs its own `fetch` (expo/fetch) as the global one, and it reads
 * a form part only as a string, a Blob or a File: React Native's
 * `{ uri, name, type }` part — what every picked photo is — is refused with
 * "Unsupported FormDataPart implementation", so no photo could be uploaded
 * (the avatar, a chat picture, a review photo). React Native's own
 * XMLHttpRequest still reads the file from its `uri`, so a form goes that
 * way and answers as a `Response`, like `fetch`. Everything else stays on
 * `fetch`.
 */
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

function headerEntries(headers: HeadersInit | undefined): [string, string][] {
  if (!headers) return [];
  if (Array.isArray(headers)) return headers.map(([key, value]) => [key, value]);
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    const entries: [string, string][] = [];
    headers.forEach((value, key) => entries.push([key, value]));
    return entries;
  }
  return Object.entries(headers as Record<string, string>);
}

/** What `fetch` rejects with when cancelled. */
function abortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

function parseHeaders(raw: string): Headers {
  const headers = new Headers();
  for (const line of raw.trim().split(/[\r\n]+/)) {
    const at = line.indexOf(':');
    if (at > 0) headers.append(line.slice(0, at).trim(), line.slice(at + 1).trim());
  }
  return headers;
}

export function xhrFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const signal = init.signal;
    const abort = () => xhr.abort();
    const done = () => signal?.removeEventListener('abort', abort);

    xhr.open((init.method ?? 'GET').toUpperCase(), url, true);
    for (const [key, value] of headerEntries(init.headers)) xhr.setRequestHeader(key, value);
    // The app sends its session cookie by hand; the phone's own cookie jar stays out, as with `fetch`.
    xhr.withCredentials = init.credentials === 'include';
    xhr.responseType = 'text';

    xhr.onload = () => {
      done();
      const status = xhr.status;
      if (status < 200 || status > 599) {
        reject(new TypeError('Network request failed'));
        return;
      }
      resolve(
        new Response(NULL_BODY_STATUSES.has(status) ? null : xhr.responseText, {
          status,
          statusText: xhr.statusText,
          headers: parseHeaders(xhr.getAllResponseHeaders() ?? ''),
        })
      );
    };
    xhr.onerror = () => {
      done();
      reject(new TypeError('Network request failed'));
    };
    xhr.ontimeout = () => {
      done();
      reject(new TypeError('Network request timed out'));
    };
    xhr.onabort = () => {
      done();
      reject(abortError());
    };

    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    signal?.addEventListener('abort', abort);
    xhr.send(init.body as XMLHttpRequestBodyInit | null | undefined);
  });
}
