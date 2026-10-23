import { Platform } from 'react-native';

import { isOffline } from '@/lib/network';

import { ApiError, NetworkError } from './errors';

/**
 * What carries a request: the network, or the mock store.
 *
 * The condition is written out in full on purpose. When the app is bundled for
 * release, Expo replaces `process.env.EXPO_PUBLIC_API_MOCK` with its value, the
 * bundler sees a comparison of two constants, and a build that is not in mock
 * mode leaves the mock store and its data out altogether.
 */
const mockFetch: typeof fetch | undefined =
  process.env.EXPO_PUBLIC_API_MOCK === '1'
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- an `import` would bundle the mock store into every build
      (require('./mocks') as typeof import('./mocks')).mockFetch
    : undefined;

// The real `fetch` is called through a wrapper: taken off the global object it
// loses the receiver a browser insists on.
const send: typeof fetch = mockFetch ?? ((input, init) => fetch(input, init));

const READS = new Set(['GET', 'HEAD', 'OPTIONS']);

function methodOf(input: RequestInfo | URL, init: RequestInit | undefined): string {
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
  return method.toUpperCase();
}

/**
 * A change (anything but a read) is not sent while the phone is offline: it
 * fails at once with an offline `NetworkError`, which the screen turns into the
 * offline sentence, and nothing half-sent is left for the store to guess at.
 * A read still goes: it may find the network back, and a failure costs nothing.
 * The mock store obeys the same rule, so offline behaves alike on mock data.
 */
export const transport: typeof fetch = (input, init) => {
  if (!READS.has(methodOf(input, init)) && isOffline()) {
    return Promise.reject(new NetworkError('offline'));
  }
  return send(input, init);
};

/** A file carries more bytes than a JSON request: it has longer to arrive. */
const FILE_TIMEOUT_MS = 30_000;

/**
 * Sends a request that carries a file or answers one and reads the answer
 * with `read`, all of it given up after `FILE_TIMEOUT_MS`. Cancelled by the
 * caller, it rejects as it was cancelled; no answer is a `NetworkError`.
 */
async function sendFile<T>(
  url: string,
  init: RequestInit,
  signal: AbortSignal | undefined,
  read: (response: Response) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, FILE_TIMEOUT_MS);
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel);

  try {
    let response: Response;
    try {
      response = await transport(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new NetworkError(timedOut ? 'timeout' : 'offline', error);
    }
    return await read(response);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

/**
 * The mock store answers in the JSON envelope only. A file it stands in for
 * comes as `{ base64 }` in `data`, and is turned here into the bytes the real
 * store would send. Like `mockFetch`, it is left out of a build that is not in
 * mock mode.
 */
const mockFile: ((response: Response) => Promise<Response>) | undefined =
  process.env.EXPO_PUBLIC_API_MOCK === '1'
    ? async (response) => {
        if (!(response.headers.get('content-type') ?? '').includes('json')) return response;
        const body: unknown = await response.clone().json();
        const data = typeof body === 'object' && body !== null && 'data' in body ? body.data : null;
        if (typeof data !== 'object' || data === null || !('base64' in data)) return response;
        const text = atob(String(data.base64));
        const bytes = Uint8Array.from(text, (char) => char.charCodeAt(0));
        return new Response(bytes, { status: 200, headers: { 'content-type': 'application/pdf' } });
      }
    : undefined;

async function refusalOf(response: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = JSON.parse(await response.text());
  } catch {
    body = undefined;
  }
  if (
    typeof body === 'object' &&
    body !== null &&
    'code' in body &&
    typeof body.code === 'string'
  ) {
    return new ApiError(
      response.status,
      body.code,
      'message' in body && typeof body.message === 'string' ? body.message : '',
      { reason: 'reason' in body && typeof body.reason === 'string' ? body.reason : undefined }
    );
  }
  // Not the store speaking (a proxy's page): the status alone says what went wrong.
  return new ApiError(
    response.status,
    response.status >= 500 ? 'INTERNAL_ERROR' : 'INVALID_RESPONSE',
    ''
  );
}

/**
 * Downloads a file the store answers with (an invoice's PDF) and returns its
 * bytes. The caller supplies the full address and the headers, session
 * included; a `body` is sent as JSON with POST (a guest's invoice). In the
 * browser the session is its cookie, sent with `credentials`. A refusal is
 * the store's JSON envelope and becomes an `ApiError`; an answer of another
 * type than `accept` is an `INVALID_RESPONSE`; no answer is a `NetworkError`.
 */
export async function downloadBinary(
  url: string,
  options: {
    headers: Record<string, string>;
    accept: string;
    body?: unknown;
    credentials?: RequestCredentials;
    signal?: AbortSignal;
  }
): Promise<Uint8Array> {
  const json = options.body === undefined ? null : JSON.stringify(options.body);
  return sendFile(
    url,
    {
      method: json === null ? 'GET' : 'POST',
      headers: {
        ...options.headers,
        Accept: options.accept,
        ...(json === null ? {} : { 'Content-Type': 'application/json' }),
      },
      body: json,
      credentials: options.credentials ?? 'omit',
    },
    options.signal,
    async (answer) => {
      const response = answer.ok && mockFile ? await mockFile(answer) : answer;
      if (!response.ok) throw await refusalOf(response);
      if (!(response.headers.get('content-type') ?? '').startsWith(options.accept)) {
        throw new ApiError(response.status, 'INVALID_RESPONSE', '');
      }
      return new Uint8Array(await response.arrayBuffer());
    }
  );
}

/** A file on the phone, as a form sends it: where it is, its name, and its Content-Type. */
export type FormFile = { uri: string; name: string; type: string };

declare global {
  interface FormData {
    /** React Native's own part, missing from the browser's types: a file on the phone, read from its `uri` as the request is sent. */
    append(name: string, value: FormFile): void;
  }
}

/**
 * Sends one file as `multipart/form-data`, in the field `field`, and returns
 * the `data` of the store's answer. The caller supplies the full address and
 * the headers, session included. No Content-Type is set here: the form sets
 * its own, with the boundary between its parts.
 *
 * A phone's `FormData` reads the file from its `uri` itself; a browser's takes
 * the bytes, so on the web they are read from the picker's `blob:` address
 * first. A refusal becomes an `ApiError`, no answer a `NetworkError`.
 */
export async function postFile(
  url: string,
  options: {
    headers: Record<string, string>;
    field: string;
    file: FormFile;
    /** Text sent beside the file, each in its own part: a message, its id. */
    fields?: Record<string, string>;
    credentials: RequestCredentials;
    signal?: AbortSignal;
  }
): Promise<unknown> {
  const { file } = options;
  const form = new FormData();
  for (const [name, value] of Object.entries(options.fields ?? {})) form.append(name, value);
  if (Platform.OS === 'web') {
    const bytes = await (await fetch(file.uri)).blob();
    form.append(options.field, new File([bytes], file.name, { type: file.type }));
  } else {
    form.append(options.field, file);
  }

  return sendFile(
    url,
    {
      method: 'POST',
      headers: { ...options.headers, Accept: 'application/json' },
      body: form,
      credentials: options.credentials,
    },
    options.signal,
    async (response) => {
      if (!response.ok) throw await refusalOf(response);
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = undefined;
      }
      if (typeof body !== 'object' || body === null || !('data' in body)) {
        throw new ApiError(response.status, 'INVALID_RESPONSE', '');
      }
      return body.data;
    }
  );
}
