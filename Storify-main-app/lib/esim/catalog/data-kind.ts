import type { DataType } from "@/lib/esim/providers/types";

/**
 * What kind of data a plan is shown as to shoppers. Suppliers' own types are
 * stored as they come (`plan.data.type`); the store then calls a day-pass that
 * slows down past its daily allowance "unlimited" when the slowed speed is
 * still usable: at least the admin's threshold (512 kbps unless changed, in
 * the pricing settings). Below it, or with no speed given, it stays a daily
 * allowance. Sale records and usage counting keep the supplier's type.
 */

export const DEFAULT_UNLIMITED_MIN_KBPS = 512;

export function shopperDataType(
  type: DataType,
  fairUse: { reducedSpeedMbps: number | null } | null | undefined,
  minKbps: number = DEFAULT_UNLIMITED_MIN_KBPS,
): DataType {
  if (type !== "daily_throttled") return type;
  const mbps = fairUse?.reducedSpeedMbps;
  return typeof mbps === "number" && mbps * 1000 >= minKbps ? "unlimited" : type;
}
