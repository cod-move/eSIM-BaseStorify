import type { FulfillmentStatus, LifecycleStatus, TopupWindow } from "@/lib/esim/providers/types";

/**
 * The status a shopper sees for an eSIM (the spec's "页面显示状态" table),
 * combined from the fulfilment status and the lifecycle. Pure.
 */

export type DisplayStatus =
  | "issuing"
  | "failed"
  | "ready_to_install"
  | "installed"
  | "in_use"
  | "data_used_up"
  | "expired"
  | "no_active_package"
  | "cancelled";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export interface DisplayInput {
  status: FulfillmentStatus;
  lifecycle: LifecycleStatus | null;
  topupSupported: boolean;
  topupWindow: TopupWindow | null;
}

export interface Display {
  status: DisplayStatus;
  /** English fallback; the page translates by `status`. */
  label: string;
  tone: Tone;
  canInstall: boolean;
  canTopup: boolean;
}

const LABELS: Record<DisplayStatus, [string, Tone]> = {
  issuing: ["Being issued", "info"],
  failed: ["Could not be issued", "danger"],
  ready_to_install: ["Ready to install", "info"],
  installed: ["Installed, not used yet", "info"],
  in_use: ["In use", "success"],
  data_used_up: ["Data used up", "warning"],
  expired: ["Expired", "neutral"],
  no_active_package: ["No active plan", "warning"],
  cancelled: ["Cancelled", "neutral"],
};

export function displayOf(input: DisplayInput): Display {
  const status = resolve(input);
  const [label, tone] = LABELS[status];
  const live = status === "ready_to_install" || status === "installed" || status === "in_use";
  return {
    status,
    label,
    tone,
    canInstall: status === "ready_to_install",
    // A plan that dies with its package cannot be topped up once expired; one
    // whose profile survives can buy a new package at any time.
    canTopup:
      input.topupSupported &&
      (live || status === "data_used_up" || status === "no_active_package"),
  };
}

function resolve(input: DisplayInput): DisplayStatus {
  if (input.status === "pending" || input.status === "processing") return "issuing";
  if (input.status === "failed") return "failed";
  if (input.status === "cancelled" || input.status === "refunded") return "cancelled";
  switch (input.lifecycle) {
    case "installed":
      return "installed";
    case "in_use":
      return "in_use";
    case "depleted":
      return "data_used_up";
    case "expired":
      return input.topupWindow === "while_profile_exists" ? "no_active_package" : "expired";
    case "cancelled":
      return "cancelled";
    default:
      return "ready_to_install";
  }
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return "—";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 2)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** Share of the allowance left, 0–100, or null when there is no allowance to measure. */
export function remainingPercent(total: number | null | undefined, remaining: number | null | undefined): number | null {
  if (!total || total <= 0 || remaining === null || remaining === undefined) return null;
  return Math.max(0, Math.min(100, Math.round((remaining / total) * 100)));
}

/**
 * A plan's name as sold. A day-priced plan is named for its shortest buy
 * ("Japan eSIM Unlimited - 1 day"); the eSIM shows the days bought instead.
 */
export function planTitle(name: string, durationDays: number | null | undefined): string {
  if (!durationDays) return name;
  const base = name.replace(/\s*[-–]\s*\d+\s*days?\s*$/i, "").trim() || name;
  return `${base} · ${durationDays === 1 ? "1 day" : `${durationDays} days`}`;
}
