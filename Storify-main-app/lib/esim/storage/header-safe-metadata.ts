/**
 * Object metadata as S3 can carry it (patch P66). Metadata travels as
 * `x-amz-meta-*` HTTP headers, which take printable ASCII only, so an upload
 * whose original name was "微信图片_….jpg" failed outright — on the website and
 * from the app alike. A value with any other character is stored
 * percent-encoded (`decodeURIComponent` gives it back); an ASCII value is kept
 * as it was. Pure.
 */
export function headerSafeMetadata(
  metadata: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!metadata) return metadata;
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const text = String(value ?? "");
    safe[key] = /^[\x20-\x7E]*$/.test(text) ? text : encodeURIComponent(text);
  }
  return safe;
}
