import "server-only";

import * as z from "zod";
import { connectDB } from "@/lib/db";
import { getEsimSettings } from "@/models/esim-pricing.model";
import { MAX_FEE_PERCENT, PAYMENT_FEE_METHODS, type PaymentFeeRule } from "@/lib/esim/payments/fee-rules";
import { ensurePaymentFeeProduct } from "@/lib/esim/payments/fee-line";

/** Payment fees per checkout method (patch P29), on Admin → eSIM → Payments. */

const METHODS = PAYMENT_FEE_METHODS.map((entry) => entry.method) as [string, ...string[]];

export const PaymentFeesSchema = z.object({
  fees: z
    .array(
      z.object({
        method: z.enum(METHODS),
        fixedMinor: z.number().int().min(0).max(100_000),
        percent: z.number().min(0).max(MAX_FEE_PERCENT),
      }),
    )
    .max(METHODS.length),
});

/** Every method, in the checkout's order, with what it charges (nothing by default). */
export async function getPaymentFees(): Promise<PaymentFeeRule[]> {
  await connectDB();
  const stored = (await getEsimSettings()).paymentFees ?? [];
  return PAYMENT_FEE_METHODS.map(({ method }) => {
    const rule = stored.find((entry) => entry.method === method);
    return { method, fixedMinor: rule?.fixedMinor ?? 0, percent: rule?.percent ?? 0 };
  });
}

/** Keeps only the methods that charge something; makes the fee product once any does. */
export async function savePaymentFees(fees: PaymentFeeRule[]) {
  const before = await getPaymentFees();
  const charging = fees.filter((rule) => rule.fixedMinor > 0 || rule.percent > 0);
  const settings = await getEsimSettings();
  settings.set("paymentFees", charging);
  await settings.save();
  if (charging.length) await ensurePaymentFeeProduct();
  return { before, after: await getPaymentFees() };
}
