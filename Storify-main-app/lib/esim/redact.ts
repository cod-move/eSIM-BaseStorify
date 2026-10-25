/**
 * Redaction for anything about a supplier call that gets stored or logged.
 *
 * By key name, recursively: whatever installs or controls an eSIM (activation
 * code, matching id, PIN/PUK, QR) or authenticates (token, key, password,
 * sign) is replaced; any string that is itself an LPA activation code is
 * replaced wherever it sits. Long strings and arrays are cut so one catalogue
 * page cannot bloat a log row.
 */

const SECRET_KEY =
  /(activation_?code|^ac$|matching_?id|qr_?code|^pin\d?$|^puk\d?$|token|secret|password|api_?key|access_?code|^sign$|authorization|^lpa$|account_?number)/i;
const MAX_STRING = 500;
const MAX_ARRAY = 20;
const MAX_DEPTH = 6;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[depth]";
  if (typeof value === "string") {
    if (/^LPA:1\$/i.test(value)) return "[redacted]";
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY).map((item) => redact(item, depth + 1));
    return value.length > MAX_ARRAY ? [...items, `[+${value.length - MAX_ARRAY} more]`] : items;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SECRET_KEY.test(key) && item !== null && item !== "" ? "[redacted]" : redact(item, depth + 1),
      ]),
    );
  }
  return value;
}
