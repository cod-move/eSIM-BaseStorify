import type { LifecycleStatus } from "@/lib/esim/providers/types";

/**
 * Which shopper reminders an eSIM is due (NTF-03/04/05/07). Pure.
 *
 * - activated: the eSIM went into use since the last look (a transition the
 *   usage sync saw), so an eSIM already in use when reminders began is not
 *   told about it days later.
 * - low_data: a counted allowance is at or below the threshold and not used
 *   up; once per allowance — a top-up raises the total and arms it again.
 * - expiring: the plan ends within the window; once per end date.
 * - install: still not installed, the install-by date is within the window;
 *   once per date.
 *
 * Nothing for an eSIM that is cancelled, or (except low data on an add-on
 * plan's live package) one whose plan has ended.
 */

export type ReminderKind = "activated" | "low_data" | "expiring" | "install";

export interface ReminderSettings {
  enabled: boolean;
  lowDataPercent: number;
  expiringHours: number;
  installDays: number;
}

export interface ReminderInput {
  lifecycle: LifecycleStatus | null;
  /** The lifecycle before this look; undefined when nothing was looked up. */
  previousLifecycle?: LifecycleStatus | null;
  installed: boolean | null;
  /** "total" / "lifetime" allowances are counted; unlimited ones are not. */
  counted: boolean;
  totalBytes: number | null;
  remainingBytes: number | null;
  expiresAt: Date | null;
  activationDeadline: Date | null;
  sent: {
    activatedAt: Date | null;
    lowDataForTotal: number | null;
    expiringFor: Date | null;
    installDeadlineFor: Date | null;
  };
}

const HOUR = 3_600_000;

export function dueReminders(input: ReminderInput, settings: ReminderSettings, now: Date = new Date()): ReminderKind[] {
  if (!settings.enabled) return [];
  if (input.lifecycle === "cancelled") return [];
  const due: ReminderKind[] = [];
  const ended = input.lifecycle === "expired";

  if (
    input.lifecycle === "in_use" &&
    input.previousLifecycle !== undefined &&
    input.previousLifecycle !== "in_use" &&
    !input.sent.activatedAt
  ) {
    due.push("activated");
  }

  const total = input.totalBytes ?? 0;
  const remaining = input.remainingBytes ?? 0;
  if (
    input.counted &&
    !ended &&
    input.lifecycle !== "depleted" &&
    total > 0 &&
    remaining > 0 &&
    (remaining / total) * 100 <= settings.lowDataPercent &&
    input.sent.lowDataForTotal !== total
  ) {
    due.push("low_data");
  }

  const expires = input.expiresAt?.getTime();
  if (
    expires &&
    !ended &&
    expires > now.getTime() &&
    expires - now.getTime() <= settings.expiringHours * HOUR &&
    input.sent.expiringFor?.getTime() !== expires
  ) {
    due.push("expiring");
  }

  const deadline = input.activationDeadline?.getTime();
  const notInstalled = (input.lifecycle === null || input.lifecycle === "not_installed") && input.installed !== true;
  if (
    deadline &&
    notInstalled &&
    deadline > now.getTime() &&
    deadline - now.getTime() <= settings.installDays * 24 * HOUR &&
    input.sent.installDeadlineFor?.getTime() !== deadline
  ) {
    due.push("install");
  }
  return due;
}

/**
 * How long the usage sync leaves an eSIM before asking its supplier again:
 * often while it is used, rarely while it waits to be installed, never once
 * it is over. Null = do not sync.
 */
export function syncIntervalMs(lifecycle: LifecycleStatus | null): number | null {
  switch (lifecycle) {
    case "in_use":
      return HOUR;
    case "installed":
      return 3 * HOUR;
    case "not_installed":
    case null:
      return 12 * HOUR;
    default:
      return null;
  }
}
