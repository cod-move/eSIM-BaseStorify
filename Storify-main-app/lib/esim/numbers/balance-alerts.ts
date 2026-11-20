import "server-only";

import { mongoose } from "@/lib/db";
import { User } from "@/models";
import { getSettings } from "@/models/settings.model";
import { EsimNumber } from "@/models/esim-number.model";
import { NotificationType } from "@/models/notification.model";
import { sendEmail } from "@/lib/email/email";
import { escapeHtml } from "@/lib/email/escape-html";
import { createNotification } from "@/lib/notifications/notifications";
import { credentialsOf, findProvider } from "@/lib/esim/provider-service";
import { withProviderLog } from "@/lib/esim/provider-log";
import { topConnectClient } from "@/lib/esim/providers/registry";
import { formatAmount } from "@/lib/esim/numbers/line";
import { alertDay, balanceAlertOf, type BalanceAlert } from "@/lib/esim/numbers/balance-policy";

/**
 * The `esim-number-balance` cron, daily at 12:00 Singapore time: reads every
 * sold number's credit from TopConnect — one `card_stat` call a number,
 * CONCURRENCY at once, so a run gets through all of them (about 2,300 numbers
 * in under two minutes) — and tells its owner when it is low (≤ 0.02) or gone
 * (≤ 0, the line is cut off), with a link to recharge. Only the card's
 * balance, currency and blocked flag are saved; the packages kept from the
 * number page stay as they were. Each kind goes out at most once a day per
 * number: the day is claimed on the number before the email is sent. A
 * number whose card could not be read is counted and skipped, never guessed.
 */

const base = () => (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");

const CONCURRENCY = 8;

export interface BalanceAlertResult {
  total: number;
  checked: number;
  unread: number;
  sent: Record<BalanceAlert, number>;
  /** Numbers not reached before the time ran out: 0 on a normal run. */
  left: number;
}

type Owned = { _id: mongoose.Types.ObjectId; msisdn: string; dialCode: string; nationalNumber: string; customer: mongoose.Types.ObjectId };

export async function runNumberBalanceAlerts(options: { budgetMs?: number; now?: Date } = {}): Promise<BalanceAlertResult> {
  const now = options.now ?? new Date();
  const day = alertDay(now);
  const deadline = Date.now() + (options.budgetMs ?? 840_000);
  const numbers = await EsimNumber.find({ status: "sold", customer: { $ne: null } })
    .select({ msisdn: 1, dialCode: 1, nationalNumber: 1, customer: 1 })
    .lean<Owned[]>();
  const result: BalanceAlertResult = { total: numbers.length, checked: 0, unread: 0, sent: { low: 0, empty: 0 }, left: 0 };
  const provider = await findProvider("topconnect");
  if (!provider || provider.status !== "active") {
    result.unread = numbers.length;
    return result;
  }
  const client = topConnectClient(credentialsOf(provider));
  const settings = await getSettings();
  const storeName = settings.general?.storeName || process.env.NEXT_PUBLIC_APP_NAME || "Our store";

  let next = 0;
  const worker = async () => {
    while (next < numbers.length) {
      if (Date.now() > deadline) return;
      const row = numbers[next++];
      result.checked += 1;
      let card: { balanceMinor: number | null; currency: string | null; blocked: boolean | null };
      try {
        ({ card } = await withProviderLog(
          { provider: provider._id as mongoose.Types.ObjectId, providerCode: "topconnect", request: { msisdn: row.msisdn }, operation: "numbers.balance" },
          () => client.cardStatus({ msisdn: row.msisdn }),
          (answer) => ({ balanceMinor: answer.card.balanceMinor, blocked: answer.card.blocked }),
        ));
      } catch {
        result.unread += 1;
        continue;
      }
      await EsimNumber.updateOne(
        { _id: row._id, card: { $ne: null } },
        { $set: { "card.checkedAt": new Date(), "card.balanceMinor": card.balanceMinor, "card.currency": card.currency, "card.blocked": card.blocked } },
      );
      await EsimNumber.updateOne(
        { _id: row._id, card: null },
        { $set: { card: { checkedAt: new Date(), balanceMinor: card.balanceMinor, currency: card.currency, blocked: card.blocked, lastUsedAt: null, packages: [] } } },
      );
      const kind = balanceAlertOf(card.balanceMinor);
      if (!kind) continue;
      if (await notify(row, kind, card, day, storeName, settings)) result.sent[kind] += 1;
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  result.left = numbers.length - next;
  if (result.left) console.error(`Number balance check ran out of time with ${result.left} numbers left`);
  return result;
}

async function notify(
  row: Owned,
  kind: BalanceAlert,
  card: { balanceMinor: number | null; currency: string | null },
  day: string,
  storeName: string,
  settings: Awaited<ReturnType<typeof getSettings>>,
): Promise<boolean> {
  const _id = row._id;
  const field = kind === "low" ? "balanceAlerts.lowOn" : "balanceAlerts.emptyOn";
  const won = await EsimNumber.updateOne({ _id, [field]: { $ne: day } }, { $set: { [field]: day } });
  if (!won.modifiedCount) return false;
  const number = `+${row.dialCode} ${row.nationalNumber}`;
  const balance = formatAmount(card.balanceMinor ?? 0, card.currency || "EUR");
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
  return true;
}
