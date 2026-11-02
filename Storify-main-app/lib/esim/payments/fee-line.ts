import "server-only";

import { mongoose } from "@/lib/db";
import { Cart } from "@/models";
import { getEsimSettings } from "@/models/esim-pricing.model";
import { hiddenProduct } from "@/lib/esim/catalog/hidden-product";
import { findWalletProduct } from "@/lib/esim/wallet/product";
import { feeRuleFor, paymentFeeLabel, paymentFeeMinor } from "@/lib/esim/payments/fee-rules";

/**
 * A payment fee is a line of the cart (patch P29): "Payment fee · Card", one
 * unit of a hidden, untaxed store product. As a line it is in the order's
 * total, its emails and its refunds, and the ledger books it as the platform's
 * own sale, whichever sellers the rest of the order is from.
 *
 * The checkout keeps it in step with the chosen method before the cart is read
 * (`syncPaymentFeeLine`), and the eSIM pricing prices it again from the other
 * lines (`paymentFeePrices`, lib/esim/cart). It is never added through the cart.
 */

export const PAYMENT_FEE_PRODUCT_TYPE = "esim-payment-fee";

const feeProduct = hiddenProduct({
  productType: PAYMENT_FEE_PRODUCT_TYPE,
  settingsKey: "paymentFeeProductId",
  name: "Payment fee",
  handle: "payment-fee",
  shortDescription: "The fee for the way an order is paid.",
  description: "<p>Added at checkout for some ways of paying.</p>",
  sku: "PAYMENT-FEE",
  optionName: "Method",
  variantName: "Payment fee",
  chargeTax: false,
});

export const findPaymentFeeProduct = feeProduct.find;
export const isPaymentFeeVariant = feeProduct.isVariant;
export const ensurePaymentFeeProduct = feeProduct.ensure;

type Line = { _id?: unknown; variantId?: unknown; price?: number; quantity?: number; lineAttributes?: unknown };

const cents = (units: number | undefined) => Math.round(Number(units ?? 0) * 100);

/** The method a fee line was priced for. */
export function feeLineMethod(line: { lineAttributes?: unknown }): string | null {
  const fee = (line.lineAttributes as { paymentFee?: { method?: unknown } } | undefined)?.paymentFee;
  return typeof fee?.method === "string" ? fee.method : null;
}

/**
 * The fee for goods worth `baseMinor` paid by `method`; nothing on a wallet
 * top-up, which has its own fee.
 */
export async function paymentFeeFor(method: string | null | undefined, baseMinor: number, walletCart: boolean): Promise<number> {
  if (walletCart) return 0;
  return paymentFeeMinor(feeRuleFor((await getEsimSettings()).paymentFees, method), baseMinor);
}

/**
 * Makes the cart hold exactly the fee `method` charges on its other lines:
 * one line, or none. Returns whether the cart changed and the fee, in cents.
 */
export async function syncPaymentFeeLine(
  query: { userId: string } | { sessionId: string },
  method: string,
): Promise<{ changed: boolean; feeMinor: number }> {
  const cart = await Cart.findOne(query).select({ items: 1 }).lean<{ _id: mongoose.Types.ObjectId; items: Line[] } | null>();
  if (!cart) return { changed: false, feeMinor: 0 };
  const rule = feeRuleFor((await getEsimSettings()).paymentFees, method);
  const product = rule ? await ensurePaymentFeeProduct() : await findPaymentFeeProduct();
  if (!product) return { changed: false, feeMinor: 0 };
  const isFee = (line: Line) => String(line.variantId ?? "") === product.variantId;
  const fees = cart.items.filter(isFee);
  const others = cart.items.filter((line) => !isFee(line));
  const walletVariant = (await findWalletProduct())?.variantId;
  const walletCart = others.some((line) => String(line.variantId ?? "") === walletVariant);
  const baseMinor = others.reduce((sum, line) => sum + cents(line.price) * (line.quantity ?? 1), 0);
  const feeMinor = others.length ? await paymentFeeFor(method, baseMinor, walletCart) : 0;

  const current = fees[0];
  if (
    (!feeMinor && !fees.length) ||
    (feeMinor && fees.length === 1 && current.quantity === 1 && cents(current.price) === feeMinor && feeLineMethod(current) === method)
  ) {
    return { changed: false, feeMinor };
  }
  await Cart.updateOne({ _id: cart._id }, { $pull: { items: { variantId: new mongoose.Types.ObjectId(product.variantId) } } });
  if (feeMinor) {
    await Cart.updateOne(
      { _id: cart._id },
      {
        $push: {
          items: {
            _id: new mongoose.Types.ObjectId(),
            productId: new mongoose.Types.ObjectId(product.productId),
            variantId: new mongoose.Types.ObjectId(product.variantId),
            quantity: 1,
            price: feeMinor / 100,
            name: "Payment fee",
            variantName: paymentFeeLabel(method),
            lineAttributes: { paymentFee: { method, fee: feeMinor } },
          },
        },
      },
    );
  }
  return { changed: true, feeMinor };
}
