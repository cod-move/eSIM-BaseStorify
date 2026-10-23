/**
 * What a tapped notification asks for. The store sends
 * `data: { url, type, notificationId }` (contract: devices.ts), but the data
 * arrives from outside the app: anything that is not a non-empty string is
 * left out.
 */
export type PushTarget = {
  /** The web path to open, the locale in front. */
  url: string | null;
  /** The notification to mark read. */
  notificationId: string | null;
};

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export function readPushTarget(data: Record<string, unknown> | undefined): PushTarget {
  return { url: text(data?.url), notificationId: text(data?.notificationId) };
}
