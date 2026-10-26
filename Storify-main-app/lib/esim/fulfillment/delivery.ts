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
import { notifyAdminsPaymentAnomaly, notifyOrderStatus } from "@/lib/notifications/notifications";
import { createSystemAuditContext } from "@/lib/audit";
import { auditOrderStatus } from "@/lib/orders/audit-order";
import { installLinks } from "@/lib/esim/fulfillment/install-links";
import { refundFailedEsims, type EsimRefundResult } from "@/lib/esim/fulfillment/refund";
import { planTitle } from "@/lib/esim/account/display";
import { findTopupProduct } from "@/lib/esim/topup/product";

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
      ${profile.customerLink ? `<p style="margin:12px 0 0"><a href="${escapeHtml(profile.customerLink)}">Open the installation page</a></p>` : ""}
    </div>`;
}

async function sendDelivery(order: OrderView, profiles: IEsimProfile[], dedupeKey: string) {
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

/** Mirrors the carrier-scan path: walk the order to delivered, guarded against a concurrent move. */
async function markDelivered(order: OrderView) {
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
  const to = await orderContactEmail(order);
  if (!to) return false;
  const items = topups
    .map((topup) => `<li><b>${escapeHtml(topup.name)}</b>${topup.iccid ? ` — eSIM ${escapeHtml(topup.iccid)}` : ""}</li>`)
    .join("");
  const batch = createHash("sha1").update(topups.map((topup) => String(topup._id)).sort().join(",")).digest("hex").slice(0, 12);
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

async function sendFailureNotice(order: OrderView, failedCount: number, total: number, refund: EsimRefundResult, kind: "eSIM" | "top-up" | "item") {
  const to = await orderContactEmail(order);
  if (!to) return;
  const which = failedCount === total ? `your ${kind}` : `${failedCount} of your ${total} ${kind}s`;
  const verb = kind === "eSIM" ? "issue" : "complete";
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
  const [jobs, topups] = await Promise.all([EsimFulfillment.find({ order: orderId }).lean(), EsimTopup.find({ order: orderId })]);
  if (!jobs.length && !topups.length) return "running";
  if (jobs.some((job) => job.state !== "fulfilled" && job.state !== "failed")) return "running";
  if (topups.some((topup) => topup.state !== "completed" && topup.state !== "failed")) return "running";
  const order = await Order.findById(orderId)
    .select({ orderNumber: 1, status: 1, items: 1, guestEmail: 1, customerId: 1 })
    .lean<OrderView | null>();
  if (!order) return "missing";

  const fulfilled = jobs.filter((job) => job.state === "fulfilled");
  const failed = jobs.filter((job) => job.state === "failed");
  const completedTopups = topups.filter((topup) => topup.state === "completed");
  const failedTopups = topups.filter((topup) => topup.state === "failed");

  // Issued eSIMs go out whatever happened to the rest of the order.
  const undelivered = fulfilled.filter((job) => !job.deliveredAt);
  if (undelivered.length) {
    const profiles = await EsimProfile.find({ _id: { $in: undelivered.map((job) => job.profile) } })
      .sort({ lineIndex: 1, unit: 1 });
    const batch = createHash("sha1").update(undelivered.map((job) => String(job._id)).sort().join(",")).digest("hex").slice(0, 12);
    await sendDelivery(order, profiles, `esim-delivery:${orderId}:${batch}`);
    await EsimFulfillment.updateMany({ _id: { $in: undelivered.map((job) => job._id) } }, { $set: { deliveredAt: new Date() } });
  }
  const unannounced = completedTopups.filter((topup) => !topup.notifiedAt);
  if (unannounced.length) {
    await sendTopupDone(order, unannounced).catch((error) => console.error("Top-up email failed:", error));
    await EsimTopup.updateMany({ _id: { $in: unannounced.map((topup) => topup._id) } }, { $set: { notifiedAt: new Date() } });
  }

  const allFailed = [...failed, ...failedTopups];
  if (allFailed.some((job) => !job.refund)) {
    const refund = await refundFailedEsims(orderId);
    if (refund.state !== "nothing") {
      const total = jobs.length + topups.length;
      await notifyAdminsPaymentAnomaly({
        title: refund.state === "refunded" ? "eSIM failed and was refunded to store credit" : "eSIM failed: refund by hand",
        message: `Order ${order.orderNumber}: ${allFailed.length} of ${total} eSIM(s) / top-up(s) failed — ${allFailed
          .map((job) => job.lastError?.message)
          .filter(Boolean)
          .join("; ")
          .slice(0, 300)}. ${refund.state === "refunded" ? `${refund.amount.toFixed(2)} ${refund.currency} credited to the shopper.` : `Refund ${refund.amount.toFixed(2)} ${refund.currency} by hand.`}`,
        dedupeKey: `esim-failed:${orderId}:${refund.state}`,
      }).catch(console.error);
      const kind = !failedTopups.length ? "eSIM" : !failed.length ? "top-up" : "item";
      await sendFailureNotice(order, allFailed.length, total, refund, kind);
    }
  }

  if (allFailed.length) return fulfilled.length || completedTopups.length ? "partial" : "failed";
  const done = new Set(jobs.map((job) => String(job.variantId)));
  if (topups.length) {
    const product = await findTopupProduct();
    if (product) done.add(product.variantId);
  }
  if (order.items.every((item) => done.has(String(item.variantId ?? "")))) {
    await markDelivered(order);
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
