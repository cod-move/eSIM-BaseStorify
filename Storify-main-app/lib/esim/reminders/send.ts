import "server-only";

import { mongoose } from "@/lib/db";
import { User } from "@/models";
import { NotificationType } from "@/models/notification.model";
import { getSettings } from "@/models/settings.model";
import type { IEsimPlan } from "@/models/esim-plan.model";
import { EsimProfile, type IEsimProfile } from "@/models/esim-profile.model";
import { sendEmail } from "@/lib/email/email";
import { escapeHtml } from "@/lib/email/escape-html";
import { createNotification } from "@/lib/notifications/notifications";
import { formatBytes, planTitle } from "@/lib/esim/account/display";
import type { ReminderKind } from "@/lib/esim/reminders/policy";

/**
 * Sends the reminders an eSIM is due (NTF-03/04/05/07): an email, and for a
 * registered shopper an in-app notice (which also pushes, where they allow
 * it). Each one is claimed on the eSIM before it goes out, so two sync runs
 * at once cannot send it twice; a send that fails is not retried — a
 * reminder is a courtesy, a second copy is worse than none.
 */

const base = () => (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");

/** The $set that records the reminder as sent, and the filter that makes the claim win once. */
function claimOf(kind: ReminderKind, profile: IEsimProfile, now: Date): { filter: Record<string, unknown>; set: Record<string, unknown> } {
  switch (kind) {
    case "activated":
      return { filter: { "reminders.activatedAt": null }, set: { "reminders.activatedAt": now } };
    case "low_data": {
      const total = profile.usage?.totalBytes ?? 0;
      return { filter: { "reminders.lowDataForTotal": { $ne: total } }, set: { "reminders.lowDataForTotal": total } };
    }
    case "expiring":
      return { filter: { "reminders.expiringFor": { $ne: profile.expiresAt } }, set: { "reminders.expiringFor": profile.expiresAt } };
    case "install":
      return { filter: { "reminders.installDeadlineFor": { $ne: profile.activationDeadline } }, set: { "reminders.installDeadlineFor": profile.activationDeadline } };
  }
}

interface Copy {
  subject: string;
  title: string;
  message: string;
  html: string;
}

function copyOf(kind: ReminderKind, profile: IEsimProfile, plan: Pick<IEsimPlan, "name" | "topup"> | null, storeName: string, canTopup: boolean): Copy {
  const name = planTitle(plan?.name ?? "eSIM", profile.durationDays);
  const page = `${base()}/account/esims/${profile._id}`;
  const topupLink = canTopup ? `${page}/topup` : null;
  const when = (date: Date | null) => (date ? date.toUTCString().replace(/:\d\d GMT$/, " UTC") : "");
  const button = (href: string, label: string) =>
    `<p style="margin:20px 0"><a href="${escapeHtml(href)}" style="background:#111;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${escapeHtml(label)}</a></p>`;
  const wrap = (heading: string, body: string, action: string) => `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222">
      <h2>${escapeHtml(heading)}</h2>
      ${body}
      ${action}
      <p style="color:#666;font-size:13px">${escapeHtml(name)}${profile.iccid ? ` · ICCID ${escapeHtml(profile.iccid)}` : ""}<br>${escapeHtml(storeName)}</p>
    </div>`;
  switch (kind) {
    case "activated":
      return {
        subject: `Your eSIM is connected: ${name}`,
        title: "Your eSIM is connected",
        message: `${name} is now in use. Check your remaining data any time in My eSIMs.`,
        html: wrap(
          "Your eSIM is connected",
          "<p>Your eSIM has connected to the network and your plan is now running. You can check how much data is left at any time.</p>",
          button(page, "See my eSIM"),
        ),
      };
    case "low_data": {
      const left = formatBytes(profile.usage?.remainingBytes);
      return {
        subject: `Only ${left} left on your eSIM`,
        title: "Your eSIM is running low",
        message: `${left} left on ${name}.${topupLink ? " Add data so you stay connected." : ""}`,
        html: wrap(
          "Your eSIM is running low",
          `<p>You have <b>${escapeHtml(left)}</b> left of ${escapeHtml(formatBytes(profile.usage?.totalBytes))}.${topupLink ? " Add data now and keep using the same eSIM — nothing new to install." : ""}</p>`,
          button(topupLink ?? page, topupLink ? "Add data" : "See my eSIM"),
        ),
      };
    }
    case "expiring":
      return {
        subject: `Your eSIM plan ends soon: ${name}`,
        title: "Your eSIM plan ends soon",
        message: `${name} ends ${when(profile.expiresAt)}.${topupLink ? " Top up to keep it going." : ""}`,
        html: wrap(
          "Your eSIM plan ends soon",
          `<p>Your plan ends on <b>${escapeHtml(when(profile.expiresAt))}</b>.${topupLink ? " Top up before then to keep using this eSIM." : " Buy a new eSIM before then if you need more time."}</p>`,
          button(topupLink ?? `${base()}/esim`, topupLink ? "Top up" : "Find a plan"),
        ),
      };
    case "install":
      return {
        subject: `Install your eSIM before ${when(profile.activationDeadline).slice(0, 16)}`,
        title: "Install your eSIM soon",
        message: `${name} must be installed before ${when(profile.activationDeadline)}.`,
        html: wrap(
          "Install your eSIM soon",
          `<p>Your eSIM has not been installed yet. It must be installed before <b>${escapeHtml(when(profile.activationDeadline))}</b>, or it may no longer work. Install it while you have Wi-Fi; the plan usually starts only when it first connects at your destination.</p>`,
          button(page, "Install my eSIM"),
        ),
      };
  }
}

export async function sendReminders(
  profile: IEsimProfile,
  kinds: ReminderKind[],
  plan: Pick<IEsimPlan, "name" | "topup"> | null,
  options: { canTopup: boolean },
): Promise<ReminderKind[]> {
  if (!kinds.length) return [];
  const user = profile.customer
    ? await User.findById(profile.customer).select({ email: 1 }).lean<{ email?: string } | null>()
    : null;
  const to = user?.email ?? profile.email;
  const settings = await getSettings();
  const storeName = settings.general?.storeName || process.env.NEXT_PUBLIC_APP_NAME || "Our store";
  const sent: ReminderKind[] = [];
  for (const kind of kinds) {
    const now = new Date();
    const claim = claimOf(kind, profile, now);
    const won = await EsimProfile.updateOne({ _id: profile._id, ...claim.filter }, { $set: claim.set });
    if (!won.modifiedCount) continue;
    const copy = copyOf(kind, profile, plan, storeName, options.canTopup && Boolean(profile.customer));
    const stamp = kind === "activated" ? "once" : kind === "low_data" ? String(profile.usage?.totalBytes ?? 0) : String((kind === "expiring" ? profile.expiresAt : profile.activationDeadline)?.getTime() ?? 0);
    const key = `esim-reminder:${kind}:${profile._id}:${stamp}`;
    if (to) {
      await sendEmail({ to, subject: copy.subject, html: copy.html, category: "esim-reminder", dedupeKey: key, settings }).catch((error) =>
        console.error("eSIM reminder email failed:", error),
      );
    }
    if (profile.customer && mongoose.isValidObjectId(profile.customer)) {
      await createNotification({
        userId: String(profile.customer),
        type: NotificationType.SYSTEM,
        title: copy.title,
        message: copy.message,
        link: `/account/esims/${profile._id}${(kind === "low_data" || kind === "expiring") && options.canTopup ? "/topup" : ""}`,
        data: { esimReminder: kind, esimId: String(profile._id), key },
        dedupe: { "data.key": key },
        sendPush: true,
      }).catch((error) => console.error("eSIM reminder notice failed:", error));
    }
    sent.push(kind);
  }
  return sent;
}
