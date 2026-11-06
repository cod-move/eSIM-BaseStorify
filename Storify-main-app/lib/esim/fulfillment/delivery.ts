import "server-only";

import { createHash } from "node:crypto";
import QRCode from "qrcode";
import { mongoose } from "@/lib/db";
import { ORDER_STATUS } from "@/config/app.config";
import { Order } from "@/models";
import { getSettings } from "@/models/settings.model";
import { EsimFulfillment } from "@/models/esim-fulfillment.model";
import { EsimTopup, type IEsimTopup } from "@/models/esim-topup.model";
import { EsimPlan } from "@/models/esim-plan.model";
import { EsimProfile, type IEsimProfile } from "@/models/esim-profile.model";
import { sendEmail } from "@/lib/email/email";
import { escapeHtml } from "@/lib/email/escape-html";
import { orderContactEmail } from "@/lib/orders/order-contact-email";
import { buildOrderStatusUpdates, subOrderUpdateOptions } from "@/lib/orders/order-status-apply";
import { advanceOrderStatusTo, type OrderStatusValue } from "@/lib/orders/order-status-workflow";
import { DELIVERY_ATTESTED_BY } from "@/lib/orders/delivery-attestation";
import { createNotification, notifyAdminsPaymentAnomaly, notifyOrderStatus } from "@/lib/notifications/notifications";
import { NotificationType } from "@/models/notification.model";
import { createSystemAuditContext } from "@/lib/audit";
import { auditOrderStatus } from "@/lib/orders/audit-order";
import { installLinks } from "@/lib/esim/fulfillment/install-links";
import { refundFailedEsims, type EsimRefundResult } from "@/lib/esim/fulfillment/refund";
import { planTitle } from "@/lib/esim/account/display";
import { findTopupProduct } from "@/lib/esim/topup/product";
import { EsimNumberOrder } from "@/models/esim-number-order.model";
import { findNumberProduct, findNumberTopupProduct } from "@/lib/esim/numbers/product";
import { EsimNumberOp, type IEsimNumberOp } from "@/models/esim-number-op.model";
import { EsimNumber } from "@/models/esim-number.model";
import { parseLpa } from "@/lib/esim/numbers/install";
import { formatAmount } from "@/lib/esim/numbers/line";

/**
 * What happens to an order once its eSIM jobs settle (ORD-09/10, NTF-01/02).
 *
 * - Issued eSIMs are emailed (QR attached, manual install details, one-tap
 *   links) as soon as nothing is still running, whether or not others failed.
 * - Failed ones are refunded to store credit (lib/esim/fulfillment/refund.ts);
 *   a guest order, or a credit that could not be given, goes to the admins to
 *   refund by hand. The shopper is told which happened.
 * - Completed top-ups (TOP-04) get a short "your top-up is on your eSIM"
 *   email; failed ones are refunded with the eSIMs (TOP-07).
 * - Numbers handed over (NUM-05/07) are emailed with their QR code and
 *   manual details; PIN and PUK stay on the number's page in the account.
 *   Recharges and data packages put on a number (NUM-08/09) get a short
 *   email; failed ones are refunded with the rest, and those a person must
 *   settle (`manual`) wait for the admins.
 * - eSIMs waiting for a supplier to be topped up (a balance hold) do not hold
 *   back the issued ones: those go out, the shopper is told the rest follow,
 *   and the order settles when the held ones are issued or fail.
 * - An order made only of eSIMs and top-ups, all done, moves to delivered the
 *   same way a carrier scan moves it (lib/shipping/tracking-cascade.ts). An
 *   order with physical goods keeps its status for the seller to ship.
 *
 * Every email carries a dedupe key, so a cron re-run cannot send it twice.
 */

type OrderView = {
  _id: mongoose.Types.ObjectId;
  orderNumber: string;
  status: string;
  items: Array<{ variantId?: unknown }>;
  guestEmail?: string;
  customerId?: unknown;
};

async function qrPng(code: string): Promise<Buffer> {
  return QRCode.toBuffer(code, { type: "png", width: 480, margin: 2, errorCorrectionLevel: "M" });
}

function esimBlock(profile: IEsimProfile, planName: string, index: number, attachmentName: string) {
  const links = installLinks(profile.installation.activationCode);
  const row = (label: string, value: string | null | undefined) =>
    value ? `<tr><td style="padding:4px 12px 4px 0;color:#666">${label}</td><td style="padding:4px 0;font-family:monospace;word-break:break-all">${escapeHtml(value)}</td></tr>` : "";
  return `
    <div style="border:1px solid #e5e5e5;border-radius:8px;padding:16px;margin:16px 0">
      <h3 style="margin:0 0 8px">eSIM ${index}: ${escapeHtml(planName)}</h3>
      <p style="margin:0 0 12px">Scan the attached QR code <b>${escapeHtml(attachmentName)}</b> with the phone that will use this eSIM, or install it by hand with the details below.</p>
      ${links ? `<p style="margin:0 0 12px"><a href="${escapeHtml(links.ios)}">Install on iPhone (iOS 17.4+)</a> &nbsp;·&nbsp; <a href="${escapeHtml(links.android)}">Install on Android</a></p>` : ""}
      <table style="border-collapse:collapse;font-size:14px">
        ${row("SM-DP+ address", profile.installation.smdpAddress)}
        ${row("Activation code", profile.installation.matchingId)}
        ${row("APN", profile.installation.apn)}
        ${row("ICCID", profile.iccid)}
        ${row("Install before", profile.activationDeadline?.toISOString().slice(0, 10))}
      </table>
    </div>`;
}

/**
 * The same news in the shopper's notifications and as an app push (NTF-01/02/06),
 * for a registered shopper; a guest has only the email. Once per key.
 */
async function noticeToShopper(order: OrderView, notice: { title: string; message: string; link: string; key: string }) {
  if (order.guestEmail || !mongoose.isValidObjectId(order.customerId)) return;
  await createNotification({
    userId: String(order.customerId),
    type: NotificationType.SYSTEM,
    title: notice.title,
    message: notice.message,
    link: notice.link,
    data: { esimOrder: String(order._id), key: notice.key },
    dedupe: { "data.key": notice.key },
    sendPush: true,
  }).catch((error) => console.error("eSIM notice failed:", error));
}

async function sendDelivery(order: OrderView, profiles: IEsimProfile[], dedupeKey: string) {
  await noticeToShopper(order, {
    title: profiles.length > 1 ? "Your eSIMs are ready" : "Your eSIM is ready",
    message: `Order ${order.orderNumber}: open it to install before you travel.`,
    link: profiles.length === 1 ? `/account/esims/${profiles[0]._id}` : "/account/esims",
    key: dedupeKey,
  });
  const to = await orderContactEmail(order);
  if (!to) return false;
  const settings = await getSettings();
  const storeName = settings.general?.storeName || process.env.NEXT_PUBLIC_APP_NAME || "Our store";
  const plans = new Map(
    (await EsimPlan.find({ _id: { $in: profiles.map((profile) => profile.plan) } }).select({ name: 1 }).lean())
      .map((plan) => [String(plan._id), plan.name]),
  );
  const attachments = [];
  const blocks = [];
  for (const [index, profile] of profiles.entries()) {
    const name = `esim-${order.orderNumber}-${index + 1}.png`;
    if (profile.installation.activationCode) {
      attachments.push({ filename: name, content: await qrPng(profile.installation.activationCode), contentType: "image/png" });
    }
    blocks.push(esimBlock(profile, planTitle(plans.get(String(profile.plan)) ?? "eSIM", profile.durationDays), index + 1, name));
  }
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222">
      <h2>Your eSIM${profiles.length > 1 ? "s are" : " is"} ready</h2>
      <p>Order <b>${escapeHtml(order.orderNumber)}</b>. Install the eSIM before you travel while you have Wi-Fi; most plans start counting only when they first connect at your destination.</p>
      ${blocks.join("")}
      <p style="color:#666;font-size:13px">Keep this email: each QR code can usually be installed only once. If you need help, just reply.</p>
      <p style="color:#666;font-size:13px">${escapeHtml(storeName)}</p>
    </div>`;
  return sendEmail({
    to,
    subject: `Your eSIM for order ${order.orderNumber}`,
    html,
    attachments,
    category: "esim-delivery",
    dedupeKey,
    settings,
  });
}

/** A number card's delivery (NUM-07): QR attached, manual details, the number's page for PIN/PUK and its balance. */
async function sendNumberDelivery(order: OrderView, jobs: Array<{ _id: unknown; number: unknown; line?: { recharge?: number; rechargeCurrency?: string; packetName?: string } | null }>, dedupeKey: string) {
  const numbers = await EsimNumber.find({ _id: { $in: jobs.map((job) => job.number as mongoose.Types.ObjectId) } })
    .select("+install")
    .lean<Array<{ _id: mongoose.Types.ObjectId; dialCode: string; nationalNumber: string; iccid: string; install?: { lpa?: string } }>>();
  if (!numbers.length) return false;
  await noticeToShopper(order, {
    title: numbers.length > 1 ? "Your numbers are ready" : "Your number is ready",
    message: `Order ${order.orderNumber}: ${numbers.map((number) => `+${number.dialCode} ${number.nationalNumber}`).join(", ")}. Open it to install.`,
    link: numbers.length === 1 ? `/account/esims/numbers/${numbers[0]._id}` : "/account/esims",
    key: dedupeKey,
  });
  const to = await orderContactEmail(order);
  if (!to) return false;
  const settings = await getSettings();
  const storeName = settings.general?.storeName || process.env.NEXT_PUBLIC_APP_NAME || "Our store";
  const attachments = [];
  const blocks = [];
  for (const number of numbers) {
    const lpa = number.install?.lpa ?? null;
    const title = `+${number.dialCode} ${number.nationalNumber}`;
    const file = `number-${number.dialCode}${number.nationalNumber}.png`;
    if (lpa) attachments.push({ filename: file, content: await qrPng(lpa), contentType: "image/png" });
    const job = jobs.find((entry) => String(entry.number) === String(number._id));
    const extras = [
      job?.line?.recharge ? `${formatAmount(job.line.recharge, job.line.rechargeCurrency ?? "EUR")} credit` : null,
      job?.line?.packetName ?? null,
    ].filter(Boolean);
    const links = installLinks(lpa);
    const manual = parseLpa(lpa);
    const row = (label: string, value: string | null | undefined) =>
      value ? `<tr><td style="padding:4px 12px 4px 0;color:#666">${label}</td><td style="padding:4px 0;font-family:monospace;word-break:break-all">${escapeHtml(value)}</td></tr>` : "";
    blocks.push(`
    <div style="border:1px solid #e5e5e5;border-radius:8px;padding:16px;margin:16px 0">
      <h3 style="margin:0 0 8px;font-family:monospace">${escapeHtml(title)}</h3>
      ${extras.length ? `<p style="margin:0 0 12px">Also bought: ${escapeHtml(extras.join(", "))} — being added to the number now.</p>` : ""}
      ${lpa ? `<p style="margin:0 0 12px">Scan the attached QR code <b>${escapeHtml(file)}</b> with the phone that will use this number, or install it by hand with the details below.</p>` : ""}
      ${links ? `<p style="margin:0 0 12px"><a href="${escapeHtml(links.ios)}">Install on iPhone (iOS 17.4+)</a> &nbsp;·&nbsp; <a href="${escapeHtml(links.android)}">Install on Android</a></p>` : ""}
      <table style="border-collapse:collapse;font-size:14px">
        ${row("SM-DP+ address", manual.smdpAddress)}
        ${row("Activation code", manual.matchingId)}
        ${row("ICCID", number.iccid)}
      </table>
      <p style="margin:12px 0 0">The PIN and PUK, the balance and the data packages are on the number's page in your account (My eSIMs).</p>
    </div>`);
  }
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222">
      <h2>Your number${numbers.length > 1 ? "s are" : " is"} ready</h2>
      <p>Order <b>${escapeHtml(order.orderNumber)}</b>. Install the eSIM while you have Wi-Fi. The number stays yours for a year after it was last used.</p>
      ${blocks.join("")}
      <p style="color:#666;font-size:13px">Keep this email: a QR code can usually be installed only once. If you need help, just reply.</p>
      <p style="color:#666;font-size:13px">${escapeHtml(storeName)}</p>
    </div>`;
  return sendEmail({
    to,
    subject: `Your number for order ${order.orderNumber}`,
    html,
    attachments,
    category: "esim-delivery",
    dedupeKey,
    settings,
  });
}

/** Credit or a data package is on a number (NUM-08/09): a short email and a notice. */
async function sendNumberOpsDone(order: OrderView, ops: IEsimNumberOp[]) {
  const batch = createHash("sha1").update(ops.map((op) => String(op._id)).sort().join(",")).digest("hex").slice(0, 12);
  const what = (op: IEsimNumberOp) => (op.kind === "packet" ? op.packet?.name ?? "Data package" : `${formatAmount(op.amountMinor, op.currency)} credit`);
  const numbers = [...new Set(ops.map((op) => String(op.number)))];
  await noticeToShopper(order, {
    title: "Added to your number",
    message: ops.map((op) => `+${op.msisdn}: ${what(op)}`).join(", ").slice(0, 200),
    link: numbers.length === 1 ? `/account/esims/numbers/${numbers[0]}` : "/account/esims",
    key: `esim-number-ops-done:${order._id}:${batch}`,
  });
  const to = await orderContactEmail(order);
  if (!to) return false;
  const items = ops.map((op) => `<li><b>${escapeHtml(what(op))}</b> — +${escapeHtml(op.msisdn)}</li>`).join("");
  return sendEmail({
    to,
    subject: `Added to your number for order ${order.orderNumber}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222">
      <h2>Added to your number</h2>
      <p>Order <b>${escapeHtml(order.orderNumber)}</b>:</p>
      <ul>${items}</ul>
      <p>Nothing to install: it is on the number already. The number's page in My eSIMs shows the balance and packages.</p>
    </div>`,
    category: "esim-delivery",
    dedupeKey: `esim-number-ops-done:${order._id}:${batch}`,
  });
}

/** Mirrors the carrier-scan path: walk the order to delivered, guarded against a concurrent move. Also for a paid wallet top-up. */
export async function markOrderDelivered(order: OrderView) {
  const path = advanceOrderStatusTo(order.status, ORDER_STATUS.DELIVERED);
  if (!path?.length) return;
  let current = order.status as OrderStatusValue;
  for (const step of path) {
    const updates = buildOrderStatusUpdates({
      status: step.to,
      changedAt: new Date(),
      changedBy: "system",
      // The supplier issuing the eSIM is third-party evidence of delivery,
      // the role a carrier scan plays; there is no closer value in the enum.
      deliveryAttestedBy: DELIVERY_ATTESTED_BY.CARRIER,
    });
    const moved = await Order.updateOne({ _id: order._id, status: current }, { $set: updates }, subOrderUpdateOptions(updates));
    if (!moved.matchedCount) return;
    current = step.to;
  }
  await notifyOrderStatus({ orderId: String(order._id), status: current }).catch(console.error);
  await auditOrderStatus(createSystemAuditContext(), order as never, {
    from: order.status,
    to: current,
    reason: "eSIM delivered",
  }).catch(console.error);
}

async function sendTopupDone(order: OrderView, topups: IEsimTopup[]) {
  const batch = createHash("sha1").update(topups.map((topup) => String(topup._id)).sort().join(",")).digest("hex").slice(0, 12);
  await noticeToShopper(order, {
    title: "Your top-up is on your eSIM",
    message: topups.map((topup) => topup.name).join(", ").slice(0, 200),
    link: topups.length === 1 && topups[0].esim ? `/account/esims/${topups[0].esim}` : "/account/esims",
    key: `esim-topup-done:${order._id}:${batch}`,
  });
  const to = await orderContactEmail(order);
  if (!to) return false;
  const items = topups
    .map((topup) => `<li><b>${escapeHtml(topup.name)}</b>${topup.iccid ? ` — eSIM ${escapeHtml(topup.iccid)}` : ""}</li>`)
    .join("");
  return sendEmail({
    to,
    subject: `Your eSIM top-up for order ${order.orderNumber} is done`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222">
      <h2>Your top-up is on your eSIM</h2>
      <p>Order <b>${escapeHtml(order.orderNumber)}</b>:</p>
      <ul>${items}</ul>
      <p>There is nothing new to install: the data is added to the eSIM already on your phone. Your balance in My eSIMs updates within a few minutes.</p>
    </div>`,
    category: "esim-delivery",
    dedupeKey: `esim-topup-done:${order._id}:${batch}`,
  });
}

/** The shopper is told once that some eSIMs are delayed while a supplier is topped up. */
async function sendDelayNotice(order: OrderView, heldCount: number, total: number) {
  const which = heldCount === total ? (total === 1 ? "your eSIM" : "your eSIMs") : `${heldCount} of your ${total} eSIMs`;
  const key = `esim-held:${order._id}`;
  await noticeToShopper(order, {
    title: `Order ${order.orderNumber}: ${which} will follow shortly`,
    message: "We are completing the rest of your order. We will email the eSIM as soon as it is issued, or refund it.",
    link: `/account/orders/${order._id}`,
    key,
  });
  const to = await orderContactEmail(order);
  if (!to) return;
  await sendEmail({
    to,
    subject: `Order ${order.orderNumber}: ${which} will follow shortly`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto"><p>We are still completing ${which} for order <b>${escapeHtml(order.orderNumber)}</b>. We will email ${heldCount === 1 ? "it" : "them"} as soon as ${heldCount === 1 ? "it is" : "they are"} issued; if we cannot issue ${heldCount === 1 ? "it" : "them"} within a day, we will refund you. There is nothing you need to do.</p></div>`,
    category: "esim-delivery",
    dedupeKey: key,
  }).catch(console.error);
}

async function sendFailureNotice(order: OrderView, failedCount: number, total: number, refund: EsimRefundResult, kind: "eSIM" | "top-up" | "number" | "number top-up" | "item") {
  const which = failedCount === total ? `your ${kind}` : `${failedCount} of your ${total} ${kind}s`;
  const verb = kind === "eSIM" || kind === "number" ? "issue" : "complete";
  await noticeToShopper(order, {
    title: refund.state === "refunded" ? `Refund for order ${order.orderNumber}` : `Your ${kind} is delayed`,
    message: refund.state === "refunded"
      ? `We could not ${verb} ${which}; ${refund.amount.toFixed(2)} ${refund.currency} is back in your balance.`
      : `We could not ${verb} ${which} right away. We will complete it or refund you shortly.`,
    link: `/account/orders/${order._id}`,
    key: `esim-failed:${order._id}:${refund.state}`,
  });
  const to = await orderContactEmail(order);
  if (!to) return;
  const body =
    refund.state === "refunded"
      ? `We could not ${verb} ${which} for order <b>${escapeHtml(order.orderNumber)}</b>, so we have refunded <b>${escapeHtml(refund.amount.toFixed(2))} ${escapeHtml(refund.currency)}</b> to your account balance. You can use it on your next purchase.`
      : `We could not ${verb} ${which} for order <b>${escapeHtml(order.orderNumber)}</b> right away. Our team has been alerted and will complete it or refund you shortly — there is nothing you need to do.`;
  await sendEmail({
    to,
    subject: refund.state === "refunded" ? `Refund for order ${order.orderNumber}` : `Your ${kind} for order ${order.orderNumber} is delayed`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto"><p>${body}</p></div>`,
    category: "esim-delivery",
    dedupeKey: `esim-failed:${order._id}:${refund.state}`,
  }).catch(console.error);
}

/**
 * Once no eSIM job or top-up is still running: deliver whatever was issued,
 * tell the shopper about completed top-ups, refund whatever failed, and
 * close an order of eSIMs and top-ups that was fully done. Safe to call
 * again — each step only touches what it has not done yet.
 */
export async function settleOrderDelivery(orderId: string) {
  const [jobs, topups, numbers, numberOps] = await Promise.all([
    EsimFulfillment.find({ order: orderId }).lean(),
    EsimTopup.find({ order: orderId }),
    EsimNumberOrder.find({ order: orderId }).lean(),
    EsimNumberOp.find({ order: orderId }),
  ]);
  if (!jobs.length && !topups.length && !numbers.length && !numberOps.length) return "running";
  // A job waiting for a supplier top-up does not hold back what is already issued.
  const held = jobs.filter((job) => job.state === "queued" && job.balanceHold);
  if (jobs.some((job) => job.state !== "fulfilled" && job.state !== "failed" && !held.includes(job))) return "running";
  if (topups.some((topup) => topup.state !== "completed" && topup.state !== "failed")) return "running";
  if (numbers.some((number) => number.state === "queued")) return "running";
  const order = await Order.findById(orderId)
    .select({ orderNumber: 1, status: 1, items: 1, guestEmail: 1, customerId: 1 })
    .lean<OrderView | null>();
  if (!order) return "missing";
  // A number is the buyer's once handed over: its install email does not wait for its first recharge or package.
  const undeliveredNumbers = numbers.filter((number) => number.state === "fulfilled" && !number.deliveredAt);
  if (undeliveredNumbers.length) {
    const batch = createHash("sha1").update(undeliveredNumbers.map((number) => String(number._id)).sort().join(",")).digest("hex").slice(0, 12);
    await sendNumberDelivery(order, undeliveredNumbers, `esim-number-delivery:${orderId}:${batch}`).catch((error) => console.error("Number email failed:", error));
    await EsimNumberOrder.updateMany({ _id: { $in: undeliveredNumbers.map((number) => number._id) } }, { $set: { deliveredAt: new Date() } });
  }
  if (numberOps.some((op) => op.state === "queued" || op.state === "processing")) return "running";

  const fulfilled = jobs.filter((job) => job.state === "fulfilled");
  const failed = jobs.filter((job) => job.state === "failed");
  const completedTopups = topups.filter((topup) => topup.state === "completed");
  const failedTopups = topups.filter((topup) => topup.state === "failed");
  // Number cards (NUM-05): handed over or failed.
  const givenNumbers = numbers.filter((number) => number.state === "fulfilled");
  const failedNumbers = numbers.filter((number) => number.state === "failed");
  const doneOps = numberOps.filter((op) => op.state === "completed");
  const failedOps = numberOps.filter((op) => op.state === "failed");

  // Issued eSIMs go out whatever happened to the rest of the order.
  const undelivered = fulfilled.filter((job) => !job.deliveredAt);
  if (undelivered.length) {
    const profiles = await EsimProfile.find({ _id: { $in: undelivered.map((job) => job.profile) } })
      .sort({ lineIndex: 1, unit: 1 });
    const batch = createHash("sha1").update(undelivered.map((job) => String(job._id)).sort().join(",")).digest("hex").slice(0, 12);
    await sendDelivery(order, profiles, `esim-delivery:${orderId}:${batch}`);
    await EsimFulfillment.updateMany({ _id: { $in: undelivered.map((job) => job._id) } }, { $set: { deliveredAt: new Date() } });
  }
  const unannouncedOps = doneOps.filter((op) => !op.notifiedAt);
  if (unannouncedOps.length) {
    await sendNumberOpsDone(order, unannouncedOps).catch((error) => console.error("Number top-up email failed:", error));
    await EsimNumberOp.updateMany({ _id: { $in: unannouncedOps.map((op) => op._id) } }, { $set: { notifiedAt: new Date() } });
  }
  const unannounced = completedTopups.filter((topup) => !topup.notifiedAt);
  if (unannounced.length) {
    await sendTopupDone(order, unannounced).catch((error) => console.error("Top-up email failed:", error));
    await EsimTopup.updateMany({ _id: { $in: unannounced.map((topup) => topup._id) } }, { $set: { notifiedAt: new Date() } });
  }

  const allFailed = [...failed, ...failedTopups, ...failedNumbers, ...failedOps];
  if (allFailed.some((job) => !job.refund)) {
    const refund = await refundFailedEsims(orderId);
    if (refund.state !== "nothing") {
      const total = jobs.length + topups.length + numbers.length + numberOps.length;
      await notifyAdminsPaymentAnomaly({
        title: refund.state === "refunded" ? "eSIM failed and was refunded to store credit" : "eSIM failed: refund by hand",
        message: `Order ${order.orderNumber}: ${allFailed.length} of ${total} eSIM(s) / top-up(s) failed — ${allFailed
          .map((job) => job.lastError?.message)
          .filter(Boolean)
          .join("; ")
          .slice(0, 300)}. ${refund.state === "refunded" ? `${refund.amount.toFixed(2)} ${refund.currency} credited to the shopper.` : `Refund ${refund.amount.toFixed(2)} ${refund.currency} by hand.`}`,
        dedupeKey: `esim-failed:${orderId}:${refund.state}`,
      }).catch(console.error);
      // Named after what failed when it is one kind; "item" when mixed.
      const kinds = new Set([failed.length && "eSIM", failedTopups.length && "top-up", failedNumbers.length && "number", failedOps.length && "number top-up"].filter(Boolean));
      const kind = kinds.size === 1 ? ([...kinds][0] as "eSIM" | "top-up" | "number" | "number top-up") : "item";
      await sendFailureNotice(order, allFailed.length, total, refund, kind);
    }
  }

  // Referral reward (REF-03) on whatever the order delivered; idempotent, and refunds are taken off it.
  const { earnReferralCommission } = await import("@/lib/esim/referral/commission");
  if (fulfilled.length || completedTopups.length || givenNumbers.length || doneOps.length) await earnReferralCommission(orderId).catch((error) => console.error("Referral commission failed:", error));
  if (held.length) {
    await sendDelayNotice(order, held.length, jobs.length).catch((error) => console.error("eSIM delay notice failed:", error));
    return "waiting";
  }
  if (allFailed.length) return fulfilled.length || completedTopups.length || givenNumbers.length || doneOps.length ? "partial" : "failed";
  const done = new Set(jobs.map((job) => String(job.variantId)));
  if (topups.length) {
    const product = await findTopupProduct();
    if (product) done.add(product.variantId);
  }
  if (numbers.length) {
    const product = await findNumberProduct();
    if (product) done.add(product.variantId);
  }
  if (numberOps.some((op) => op.source === "line")) {
    const product = await findNumberTopupProduct();
    if (product) done.add(product.variantId);
  }
  // A payment fee line (patch P29) has nothing to deliver.
  const { findPaymentFeeProduct } = await import("@/lib/esim/payments/fee-line");
  const feeProduct = await findPaymentFeeProduct();
  if (feeProduct) done.add(feeProduct.variantId);
  if (order.items.every((item) => done.has(String(item.variantId ?? "")))) {
    await markOrderDelivered(order);
  }
  return "delivered";
}

/**
 * Sends one issued eSIM's delivery email again (admin, ADM-07), to the order's
 * contact address. A fresh dedupe key, so it is not taken for the original.
 */
export async function resendEsimDelivery(profileId: string): Promise<boolean> {
  const profile = await EsimProfile.findById(profileId);
  if (!profile || profile.status !== "fulfilled") return false;
  const order = await Order.findById(profile.order)
    .select({ orderNumber: 1, status: 1, items: 1, guestEmail: 1, customerId: 1 })
    .lean<OrderView | null>();
  if (!order) return false;
  return sendDelivery(order, [profile], `esim-delivery-resend:${profileId}:${Date.now()}`);
}
