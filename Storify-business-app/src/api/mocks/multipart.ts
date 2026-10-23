/** Binary content is included so equal metadata cannot replay a different file's answer. */
export type MockMultipartFile = {
  readonly [multipartFile]: true;
  filename: string;
  mimeType: string;
  size: number;
  bytes: number[];
};

const multipartFile = Symbol('mock-multipart-file');

export function isMockMultipartFile(value: unknown): value is MockMultipartFile {
  return Boolean(value && typeof value === 'object' && multipartFile in value);
}

export async function parseMockBody(body: RequestInit['body']): Promise<unknown> {
  if (typeof body === 'string') return body ? JSON.parse(body) : undefined;
  if (!(body instanceof FormData)) return undefined;
  const parts: [string, FormDataEntryValue][] = [];
  body.forEach((value, name) => parts.push([name, value]));
  const fields: Record<string, unknown> = {};
  for (const [name, value] of parts) {
    const parsed: string | MockMultipartFile =
      typeof value === 'string'
        ? value
        : {
            filename: value.name,
            mimeType: value.type,
            size: value.size,
            bytes: Array.from(new Uint8Array(await value.arrayBuffer())),
            [multipartFile]: true,
          };
    // Keep duplicates visible to validation, rather than silently choosing one file.
    fields[name] = name in fields ? [fields[name], parsed] : parsed;
  }
  return fields;
}
