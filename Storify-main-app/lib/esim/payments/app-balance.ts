import "server-only";

import type { CheckoutPaymentMethod } from "@/contracts/mobile/shop/v1/checkout";
import type { AuditContext } from "@/lib/audit";
import { toMoney } from "@/lib/api-core/shop/money";
import { claimCartForOrder, createOrder } from "@/lib/checkout/checkout-order-document";
import { orderDocumentParams } from "@/lib/checkout/gateway-start/attempt";
import type { CheckoutDraft } from "@/lib/checkout/prepare-checkout";
import { ValidationError } from "@/lib/api/errors";
import { translator } from "@/lib/esim/i18n/server";
import { isWalletCart } from "@/lib/esim/wallet/park";
import { checkoutCreditAvailable } from "@/lib/store-credit/store-credit";
import { PAYMENT_STATUS } from "@/config/app.config";
import { feeLineMethod } from "./fee-line";

/**
 * The account balance as a payment method in the shopper app (WAL-03, patch
 * P27), as the website's checkout has it: offered to a signed-in shopper,
 * chosen it pays the whole order ("store_credit"); short of the order it is
 * shown greyed with what is there. A balance top-up is never paid from it.
 * The order is placed the way the website's checkout places it.
 */

interface QuotedCart {
  cart?: { _id?: unknown } | null;
  items?: ReadonlyArray<{ price?: number; quantity?: number; lineAttributes?: unknown; variantId?: unknown }>;
  total?: number;
}

/** The balance row of the app's quote; null for a guest, a top-up, or a balance that cannot be read. */
export async function appBalanceMethod(
  priced: QuotedCart,
  options: { customerId: string | null | undefined; currency: string; locale: string },
): Promise<CheckoutPaymentMethod | null> {
  if (!options.customerId || !priced.cart?._id) return null;
  const items = priced.items ?? [];
  if (await isWalletCart(items)) return null;
  let available: number;
  try {
    available = await checkoutCreditAvailable({ customerId: options.customerId, currency: options.currency, cartId: String(priced.cart._id) });
  } catch (error) {
    console.error("Reading the balance for the app's checkout failed:", error);
    return null;
  }
  // Judged without the payment fee of another method: the balance pays none.
  const fee = items.filter((item) => feeLineMethod(item)).reduce((sum, item) => sum + (item.price ?? 0) * (item.quantity ?? 1), 0);
  const due = Math.max(0, (priced.total ?? 0) - fee);
  const t = await translator(options.locale);
  const amount = toMoney(available, options.currency).formatted;
  const base = { id: "store_credit" as const, flow: "cod" as const, name: t("esim.wallet.method", "Account balance") };
  if (available > 0 && available + 1e-9 >= due) {
    return { ...base, available: true, message: t("esim.wallet.available", "{amount} available", { amount }) };
  }
  return { ...base, available: false, reason: "BALANCE_SHORT", message: t("esim.wallet.short", "Not enough balance: {amount} available", { amount }) };
}

/**
 * Places the order paid from the balance, as the website's checkout does
 * (app/api/payments/checkout/route.ts, "store_credit"): written paid, then
 * settled like a captured payment, the balance's hold spent with it.
 */
export async function placeAppBalanceOrder(draft: CheckoutDraft, options: { idempotencyKey: string; audit: AuditContext }) {
  const { orderStoreCredit, cart, settings, customerEmail } = draft;
  if (!orderStoreCredit) {
    throw new ValidationError({ paymentMethod: ["You have no balance to pay with. Choose another way to pay."] });
  }
  const releaseCartClaim = await claimCartForOrder(cart._id);
  let order: Awaited<ReturnType<typeof createOrder>>;
  let settled: { ok: boolean };
  try {
    order = await createOrder({
      ...orderDocumentParams(draft),
      paymentMethod: "store_credit",
      paymentStatus: PAYMENT_STATUS.PAID,
      paidAt: new Date(),
      idempotencyKey: options.idempotencyKey,
    });
    const { settleCapturedOrder } = await import("@/lib/payments/finalize-order");
    settled = await settleCapturedOrder({
      order: order as unknown as Parameters<typeof settleCapturedOrder>[0]["order"],
      provider: { label: "Store credit", recoveryGateway: "store_credit" },
      paymentId: orderStoreCredit.holdKey,
      auditTransactionId: null,
      recordPlacement: true,
      settings,
      actor: options.audit,
      cart: { cartId: cart._id },
      recoveryMessage: "Paid with store credit",
      customerEmail,
    });
  } finally {
    await releaseCartClaim();
  }
  if (!settled.ok) {
    throw new ValidationError({ stock: ["Some items in your cart sold out just now. Your balance has been given back."] });
  }
  return {
    orderId: String(order._id),
    orderNumber: order.orderNumber,
    paymentMethod: "store_credit" as const,
    total: toMoney(order.total, settings.general?.defaultCurrency || "USD"),
  };
}
