import "server-only";

import { mongoose } from "@/lib/db";
import { ORDER_STATUS, PAYMENT_STATUS } from "@/config/app.config";
import { Order, User } from "@/models";
import { NotificationType } from "@/models/notification.model";
import { StoreCreditTransaction } from "@/models/store-credit.model";
import { issueStoreCredit } from "@/lib/store-credit/store-credit";
import { createNotification, notifyAdminsPaymentAnomaly } from "@/lib/notifications/notifications";
import { sendEmail } from "@/lib/email/email";
import { escapeHtml } from "@/lib/email/escape-html";
import { appBaseUrl } from "@/lib/app-url";
import { walletAttributesOf, walletCreditOfOrder } from "@/lib/esim/wallet/booking";
import { findWalletProduct } from "@/lib/esim/wallet/product";
import { markOrderDelivered } from "@/lib/esim/fulfillment/delivery";

/**
 * A paid wallet top-up becomes balance (WAL-01): one store-credit lot with
 * source `wallet_topup` (patch P12), the amount `walletCreditOfOrder` gives —
 * the same figure the ledger booked as owed to the shopper (patch P19).
 * Idempotent on the order: payment settlement and the cron may both ask.
 * The order, made only of the top-up, is then delivered.
 */

type WalletOrder = {
  _id: mongoose.Types.ObjectId;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  currency?: string;
  customerId?: unknown;
  guestEmail?: string | null;
  total?: number;
  tax?: number;
  shippingCost?: number;
  customs?: { dutyAmount?: number | null } | null;
  items: Array<{ variantId?: unknown; price?: number; quantity?: number; lineAttributes?: unknown }>;
};

const keyOf = (orderId: unknown) => `esim-wallet:${orderId}`;

/** Wallet top-up lines on this order still to be credited (0 or 1 — the top-up is bought alone). */
export async function walletTopupsDue(orderId: unknown): Promise<number> {
  const product = await findWalletProduct();
  if (!product) return 0;
  const order = await Order.findById(orderId).select({ items: 1, paymentStatus: 1, status: 1 }).lean<WalletOrder | null>();
  if (!order || order.paymentStatus !== PAYMENT_STATUS.PAID || order.status === ORDER_STATUS.CANCELLED) return 0;
  if (!order.items.some((item) => String(item.variantId ?? "") === product.variantId && walletAttributesOf(item))) return 0;
  return (await StoreCreditTransaction.exists({ idempotencyKey: keyOf(order._id) })) ? 0 : 1;
}

export async function creditWalletTopups(orderId: unknown): Promise<{ credited: number; amount: number }> {
  const product = await findWalletProduct();
  if (!product) return { credited: 0, amount: 0 };
  const order = await Order.findById(orderId)
    .select({ orderNumber: 1, status: 1, paymentStatus: 1, currency: 1, customerId: 1, guestEmail: 1, total: 1, tax: 1, shippingCost: 1, customs: 1, items: 1 })
    .lean<WalletOrder | null>();
  if (!order || order.paymentStatus !== PAYMENT_STATUS.PAID || order.status === ORDER_STATUS.CANCELLED) return { credited: 0, amount: 0 };
  const lines = order.items.filter((item) => String(item.variantId ?? "") === product.variantId && walletAttributesOf(item));
  if (!lines.length) return { credited: 0, amount: 0 };
  const key = keyOf(order._id);
  if (await StoreCreditTransaction.exists({ idempotencyKey: key })) return { credited: 0, amount: 0 };

  const amount = walletCreditOfOrder(order);
  const currency = String(order.currency || "USD").toUpperCase();
  const customerId = !order.guestEmail && mongoose.isValidObjectId(order.customerId) ? String(order.customerId) : null;
  if (!customerId || !(amount > 0)) {
    // The cart refuses a guest's top-up; an order like this was made some other way.
    await notifyAdminsPaymentAnomaly({
      title: "Wallet top-up could not be credited",
      message: `Order ${order.orderNumber}: ${!customerId ? "no account to credit" : "nothing to credit"}. Credit ${amount.toFixed(2)} ${currency} by hand or refund it.`,
      dedupeKey: `esim-wallet-uncredited:${order._id}`,
      link: `/admin/orders/${order._id}`,
    }).catch(console.error);
    return { credited: 0, amount };
  }

  const lot = await issueStoreCredit({
    customerId,
    currency,
    amount,
    source: "wallet_topup",
    orderId: order._id,
    note: `Wallet top-up, order ${order.orderNumber}`,
    createdBy: "system",
    idempotencyKey: key,
  });
  const lotId = String(lot._id);
  const formatted = new Intl.NumberFormat("en", { style: "currency", currency }).format(amount);
  await createNotification({
    userId: customerId,
    type: NotificationType.STORE_CREDIT,
    title: "Money added to your balance",
    message: `${formatted} was added to your balance. Use it at checkout.`,
    link: "/account/store-credit",
    data: { lotId },
    dedupe: { type: NotificationType.STORE_CREDIT, "data.lotId": lotId },
  }).catch(console.error);
  const user = await User.findById(customerId).select({ email: 1 }).lean<{ email?: string } | null>();
  if (user?.email) {
    await sendEmail({
      to: user.email,
      subject: `${formatted} added to your balance`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222">
        <h2>Money added to your balance</h2>
        <p>Order <b>${escapeHtml(order.orderNumber)}</b>: <b>${escapeHtml(formatted)}</b> is now in your balance. It is used at checkout for eSIMs and top-ups.</p>
        <p><a href="${escapeHtml(`${appBaseUrl()}/account/store-credit`)}">See my balance</a></p>
      </div>`,
      category: "esim-wallet",
      dedupeKey: `esim-wallet-credited:${order._id}`,
    }).catch(console.error);
  }
  if (order.items.every((item) => String(item.variantId ?? "") === product.variantId)) {
    await markOrderDelivered(order as unknown as Parameters<typeof markOrderDelivered>[0]).catch(console.error);
  }
  return { credited: 1, amount };
}
