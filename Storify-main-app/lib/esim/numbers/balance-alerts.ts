import "server-only";

import { mongoose } from "@/lib/db";
import { User } from "@/models";
import { getSettings } from "@/models/settings.model";
import { EsimNumber } from "@/models/esim-number.model";
import { NotificationType } from "@/models/notification.model";
import { sendEmail } from "@/lib/email/email";
import { escapeHtml } from "@/lib/email/escape-html";
import { createNotification } from "@/lib/notifications/notifications";
import { refreshNumberCard } from "@/lib/esim/numbers/account";
import { formatAmount } from "@/lib/esim/numbers/line";
import { alertDay, balanceAlertOf, type BalanceAlert } from "@/lib/esim/numbers/balance-policy";

/**
 * The `esim-number-balance` cron, daily at 12:00 Beijing time: reads every
 * sold number's credit from TopConnect and tells its owner when it is low
 * (≤ 0.02) or gone (≤ 0, the line is cut off), with a link to recharge.
 * Each kind goes out at most once a day per number: the day is claimed on
 * the number before the email is sent, so two runs cannot both send it.
 * A number whose card could not be read today is skipped, never guessed.
 */

const base = () => (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");

export interface BalanceAlertResult {
  checked: number;
  unread: number;
  sent: Record<BalanceAlert, number>;
}

export async function runNumberBalanceAlerts(options: { budgetMs?: number; now?: Date } = {}): Promise<BalanceAlertResult> {
  const now = options.now ?? new Date();
  const day = alertDay(now);
  const deadline = Date.now() + (options.budgetMs ?? 240_000);
  const result: BalanceAlertResult = { checked: 0, unread: 0, sent: { low: 0, empty: 0 } };
  const ids = await EsimNumber.find({ status: "sold", customer: { $ne: null } })
    .sort({ "card.checkedAt": 1 })
    .select({ _id: 1 })
    .lean<Array<{ _id: mongoose.Types.ObjectId }>>();
  const settings = await getSettings();
  const storeName = settings.general?.storeName || process.env.NEXT_PUBLIC_APP_NAME || "Our store";

  for (const { _id } of ids) {
    if (Date.now() > deadline) break;
    result.checked += 1;
    const fresh = await refreshNumberCard(String(_id)).catch(() => false);
    const row = await EsimNumber.findById(_id).select({ msisdn: 1, dialCode: 1, nationalNumber: 1, customer: 1, card: 1 }).lean();
    const checkedToday = row?.card?.checkedAt && now.getTime() - new Date(row.card.checkedAt).getTime() < 6 * 3_600_000;
    if (!row || !fresh || !checkedToday) {
      result.unread += 1;
      continue;
    }
    const kind = balanceAlertOf(row.card?.balanceMinor);
    if (!kind || !row.customer) continue;
    const field = kind === "low" ? "balanceAlerts.lowOn" : "balanceAlerts.emptyOn";
    const won = await EsimNumber.updateOne({ _id, [field]: { $ne: day } }, { $set: { [field]: day } });
    if (!won.modifiedCount) continue;

    const number = `+${row.dialCode} ${row.nationalNumber}`;
    const balance = formatAmount(row.card?.balanceMinor ?? 0, row.card?.currency || "EUR");
    const link = `${base()}/account/esims/numbers/${_id}`;
    const copy =
      kind === "low"
        ? {
            subject: `Low balance on ${number}`,
            title: "Your number's balance is low",
            message: `${number} has ${balance} left. Recharge now to keep your line working: ${link}`,
            body: `<p>Your number <b>${escapeHtml(number)}</b> has only <b>${escapeHtml(balance)}</b> left. Recharge now so the line is not cut off.</p>`,
          }
        : {
            subject: `${number} is out of credit: recharge to restore service`,
            title: "Out of credit: service stopped",
            message: `${number} has no credit left and its service is stopped. Recharge now to restore the signal: ${link}`,
            body: `<p>Your number <b>${escapeHtml(number)}</b> has no credit left (${escapeHtml(balance)}) and its service is stopped. Recharge now to restore the signal.</p>`,
          };
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222">
        <h2>${escapeHtml(copy.title)}</h2>
        ${copy.body}
        <p style="margin:20px 0"><a href="${escapeHtml(link)}" style="background:#111;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Recharge now</a></p>
        <p style="font-size:13px;color:#666">${escapeHtml(link)}<br>${escapeHtml(storeName)}</p>
      </div>`;
    const key = `esim-number-balance:${kind}:${_id}:${day}`;
    const user = await User.findById(row.customer).select({ email: 1 }).lean<{ email?: string } | null>();
    if (user?.email) {
      await sendEmail({ to: user.email, subject: copy.subject, html, category: "esim-reminder", dedupeKey: key, settings }).catch((error) =>
        console.error("Number balance email failed:", error),
      );
    }
    await createNotification({
      userId: String(row.customer),
      type: NotificationType.SYSTEM,
      title: copy.title,
      message: copy.message,
      link: `/account/esims/numbers/${_id}`,
      data: { esimNumberBalance: kind, numberId: String(_id), key },
      dedupe: { "data.key": key },
      sendPush: true,
    }).catch((error) => console.error("Number balance notice failed:", error));
    result.sent[kind] += 1;
  }
  return result;
}
