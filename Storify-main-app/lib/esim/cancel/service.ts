import "server-only";

import { connectDB, mongoose } from "@/lib/db";
import { ORDER_STATUS, PAYMENT_STATUS } from "@/config/app.config";
import { Order } from "@/models";
import { EsimFulfillment } from "@/models/esim-fulfillment.model";
import { EsimPackage } from "@/models/esim-package.model";
import { EsimPlan } from "@/models/esim-plan.model";
import { EsimProfile, type IEsimProfile } from "@/models/esim-profile.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { EsimTopup } from "@/models/esim-topup.model";
import { getEsimSettings } from "@/models/esim-pricing.model";
import { adapterFor } from "@/lib/esim/provider-service";
import { withProviderLog } from "@/lib/esim/provider-log";
import { findOwnedEsim } from "@/lib/esim/account/esims";
import { refundUnitsToBalance } from "@/lib/esim/fulfillment/refund";

/**
 * Calling an issued eSIM off (USR-07/08).
 *
 * - The shopper: only a plan the supplier marks refundable, not installed or
 *   used yet, at a supplier that can cancel through its API, while the store
 *   allows it. The supplier is asked first; only once it confirms is the
 *   shopper refunded — their share of what the order collected less the
 *   store's fee, to the balance (or, set so or for a guest, by hand from the
 *   order screen).
 * - A refund of the whole order in Storify (patch P4): jobs not bought yet are
 *   stopped, eSIMs not installed are cancelled at the supplier where it
 *   allows, and the admins are told about any that stay usable.
 */

export class CancelError extends Error {}

export type CancelRefusal = "disabled" | "not_refundable" | "installed" | "not_live" | "supplier" | "already";

/** The status shown, and what is ruled out, as a refusal code (the page words it). */
export async function cancellationOffer(profile: IEsimProfile): Promise<
  { allowed: true; paidMinor: number; feeMinor: number; refundMinor: number; refundTo: "balance" | "original" } | { allowed: false; reason: CancelRefusal }
> {
  const settings = (await getEsimSettings()).cancellation;
  if (!settings?.enabled) return { allowed: false, reason: "disabled" };
  if (profile.cancellation && profile.cancellation.state !== "refused") return { allowed: false, reason: "already" };
  if (profile.status !== "fulfilled") return { allowed: false, reason: "not_live" };
  const lifecycle = profile.lifecycle?.status ?? null;
  if (lifecycle && lifecycle !== "not_installed") return { allowed: false, reason: lifecycle === "cancelled" ? "already" : "installed" };
  if (profile.lifecycle?.installed) return { allowed: false, reason: "installed" };
  const plan = await EsimPlan.findById(profile.plan).select({ extras: 1 }).lean<{ extras?: { refundable?: boolean } } | null>();
  if (!plan?.extras?.refundable) return { allowed: false, reason: "not_refundable" };
  const provider = await EsimProvider.findOne({ code: profile.providerCode, status: "active" }).select("+secretCredentials");
  if (!provider || !adapterFor(provider).capabilities.cancel) return { allowed: false, reason: "supplier" };

  const order = await Order.findById(profile.order).select({ total: 1, items: 1 }).lean<{ total?: number; items?: Array<{ price: number; quantity: number }> } | null>();
  const line = order?.items?.[profile.lineIndex];
  const lineSum = (order?.items ?? []).reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
  const paidMinor = line && lineSum > 0 ? Math.floor((Number(line.price) * Number(order?.total || 0) * 100) / lineSum + 1e-6) : 0;
  const feeMinor = Math.min(paidMinor, Math.round(settings.feeFixedMinor + (paidMinor * settings.feePercent) / 100));
  return { allowed: true, paidMinor, feeMinor, refundMinor: paidMinor - feeMinor, refundTo: settings.refundTo };
}

/** Asks the supplier to cancel; marks the eSIM and its packages cancelled when it agrees. */
export async function cancelAtSupplier(profile: IEsimProfile): Promise<{ cancelled: boolean; message: string }> {
  if (profile.lifecycle?.status === "cancelled") return { cancelled: true, message: "Already cancelled" };
  const provider = await EsimProvider.findOne({ code: profile.providerCode }).select("+secretCredentials");
  if (!provider) return { cancelled: false, message: "Supplier is not set up" };
  const adapter = adapterFor(provider);
  if (!adapter.capabilities.cancel) return { cancelled: false, message: `${provider.name} does not support cancelling an eSIM through its API` };
  const result = await withProviderLog(
    { provider: provider._id as mongoose.Types.ObjectId, providerCode: provider.code, operation: "cancel", refs: { esimId: String(profile._id), orderId: String(profile.order) } },
    () => adapter.cancel({ providerEsimId: profile.providerEsimId, simId: profile.simId, iccid: profile.iccid }),
    (value) => ({ status: value.status }),
  );
  if (result.status !== "cancelled") return { cancelled: false, message: `The supplier answered: ${result.status}` };
  await EsimProfile.updateOne({ _id: profile._id }, { $set: { "lifecycle.status": "cancelled", "lifecycle.lastStatusUpdateAt": new Date() } });
  await EsimPackage.updateMany({ esim: profile._id }, { $set: { status: "cancelled" } });
  return { cancelled: true, message: "Cancelled at the supplier" };
}

/** The shopper calls their eSIM off (USR-07). Refused with a `CancelError` naming the reason. */
export async function cancelByShopper(userId: string, esimId: string) {
  await connectDB();
  const profile = await findOwnedEsim(userId, esimId);
  if (!profile) throw new CancelError("eSIM not found");
  const offer = await cancellationOffer(profile);
  if (!offer.allowed) throw new CancelError(offer.reason);

  // One cancellation at a time: the claim is the cancellation record itself.
  const claimed = await EsimProfile.findOneAndUpdate(
    { _id: profile._id, $or: [{ cancellation: null }, { "cancellation.state": "refused" }] },
    { $set: { cancellation: { state: "pending", by: "shopper", at: new Date(), refundMinor: 0, feeMinor: 0, refund: "none", note: null } } },
    { returnDocument: "after" },
  );
  if (!claimed) throw new CancelError("already");

  const supplier = await cancelAtSupplier(claimed);
  if (!supplier.cancelled) {
    await EsimProfile.updateOne({ _id: profile._id }, { $set: { "cancellation.state": "refused", "cancellation.note": supplier.message.slice(0, 500) } });
    throw new CancelError("supplier");
  }

  const original = offer.refundTo === "original";
  const refund = original
    ? null
    : await refundUnitsToBalance({
        orderId: String(profile.order),
        lineIndexes: [profile.lineIndex],
        feeMinor: offer.feeMinor,
        reason: "eSIM cancelled by the shopper",
        note: `eSIM for order ${profile.orderNumber} was cancelled`,
        metadata: { esimProfile: String(profile._id), cancellation: true },
      });
  if (original) {
    const { notifyAdminsPaymentAnomaly } = await import("@/lib/notifications/notifications");
    await notifyAdminsPaymentAnomaly({
      title: "Refund a cancelled eSIM",
      message: `Order ${profile.orderNumber}: the shopper cancelled an eSIM (ICCID ${profile.iccid ?? "—"}). Refund ${(offer.refundMinor / 100).toFixed(2)} to the original payment from the order screen (fee kept: ${(offer.feeMinor / 100).toFixed(2)}).`,
      dedupeKey: `esim-cancel-original:${profile._id}`,
    }).catch(console.error);
  }
  const refundedMinor = refund?.state === "refunded" ? Math.round(refund.amount * 100) : 0;
  await EsimProfile.updateOne(
    { _id: profile._id },
    {
      $set: {
        status: refundedMinor > 0 ? "refunded" : "cancelled",
        "cancellation.state": "cancelled",
        "cancellation.refundMinor": original ? offer.refundMinor : Math.round((refund?.amount ?? 0) * 100),
        "cancellation.feeMinor": refund?.feeMinor ?? offer.feeMinor,
        "cancellation.refund": refundedMinor > 0 ? "balance" : (refund?.amount ?? offer.refundMinor) > 0 ? "manual" : "none",
      },
    },
  );
  return {
    refundMinor: original ? offer.refundMinor : Math.round((refund?.amount ?? 0) * 100),
    feeMinor: refund?.feeMinor ?? offer.feeMinor,
    refund: refundedMinor > 0 ? ("balance" as const) : ("manual" as const),
  };
}

const NOT_BOUGHT = { state: "queued" } as const;

/**
 * A refund recorded in Storify (patch P4, from `createRefundTransaction`).
 * Only a whole order refunded, or one cancelled, calls its eSIMs off; a
 * partial refund only tells the admins which eSIMs the order has. Never
 * throws.
 */
export async function esimOnOrderRefunded(input: { orderId: unknown; metadata?: Record<string, unknown> | null }) {
  try {
    // The eSIM module's own refunds (a failed eSIM, a cancellation) are already handled.
    if (input.metadata?.esim === true) return;
    await connectDB();
    const orderId = String(input.orderId ?? "");
    if (!mongoose.isValidObjectId(orderId)) return;
    const order = await Order.findById(orderId).select({ orderNumber: 1, paymentStatus: 1, status: 1 }).lean<{ orderNumber: string; paymentStatus?: string; status?: string } | null>();
    if (!order) return;
    const profiles = await EsimProfile.find({ order: orderId, status: "fulfilled", "lifecycle.status": { $ne: "cancelled" } });
    const whole = order.paymentStatus === PAYMENT_STATUS.REFUNDED || order.status === ORDER_STATUS.CANCELLED;
    const { notifyAdminsPaymentAnomaly } = await import("@/lib/notifications/notifications");

    if (!whole) {
      if (!profiles.length) return;
      await notifyAdminsPaymentAnomaly({
        title: "Partial refund on an order with eSIMs",
        message: `Order ${order.orderNumber} was partly refunded and has ${profiles.length} eSIM(s) still usable. If the refund was for an eSIM, cancel it under eSIM → eSIMs.`,
        dedupeKey: `esim-partial-refund:${orderId}`,
      }).catch(console.error);
      return;
    }

    // Not bought yet: never buy them now.
    const stop = { $set: { state: "failed", lastError: { code: "order_refunded", message: "The order was refunded", at: new Date() }, refund: { state: "done", amount: 0, at: new Date(), note: "order refunded in Storify" } } };
    await EsimFulfillment.updateMany({ order: orderId, ...NOT_BOUGHT }, stop);
    await EsimTopup.updateMany({ order: orderId, ...NOT_BOUGHT }, stop);

    const stillUsable: string[] = [];
    for (const profile of profiles) {
      const installed = Boolean(profile.lifecycle?.installed) || (profile.lifecycle?.status ?? "not_installed") !== "not_installed";
      const result = installed ? { cancelled: false } : await cancelAtSupplier(profile).catch(() => ({ cancelled: false }));
      if (result.cancelled) {
        await EsimProfile.updateOne(
          { _id: profile._id },
          { $set: { status: "refunded", cancellation: { state: "cancelled", by: "order_refund", at: new Date(), refundMinor: 0, feeMinor: 0, refund: "none", note: "order refunded in Storify" } } },
        );
      } else {
        stillUsable.push(profile.iccid ?? String(profile._id));
      }
    }
    if (stillUsable.length) {
      await notifyAdminsPaymentAnomaly({
        title: "Refunded order with eSIMs still usable",
        message: `Order ${order.orderNumber} was refunded, but ${stillUsable.length} eSIM(s) are installed or their supplier cannot cancel them (${stillUsable.join(", ")}). Cancel them with the supplier if the refund should end them.`,
        dedupeKey: `esim-refund-usable:${orderId}`,
      }).catch(console.error);
    }
  } catch (error) {
    console.error("Calling off the eSIMs of a refunded order failed:", error);
  }
}

/** For the shopper's pages: whether this eSIM of theirs can be cancelled, and for how much. */
export async function shopperCancelOffer(userId: string, esimId: string) {
  await connectDB();
  const profile = await findOwnedEsim(userId, esimId);
  return profile ? cancellationOffer(profile) : null;
}
