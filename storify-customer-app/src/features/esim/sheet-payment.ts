import { startEsimSheet } from '@/api/endpoints/esim-pay';
import type { PlaceOrderRequest } from '@/contracts/mobile/shop/v1';
import { env } from '@/config/env';
import { presentMockSheet } from '@/features/payments/mock-sheet';
import { presentCardSheet } from '@/features/payments/stripe-sheet';
import type { SheetResult } from '@/features/payments/stripe-sheet.types';

/**
 * An eSIM payment method paid in the gateway's native sheet (APP-09): the
 * eSIM module's Stripe, as a PaymentIntent of its own, shown in the same
 * Payment Sheet as Storify's card payments. The store learns of the payment
 * from Stripe's webhook and makes the order; the app then asks, as it does
 * after a payment page.
 */
export async function payBySheet(
  locale: string,
  checkoutRef: string,
  method: string,
  request: PlaceOrderRequest
): Promise<SheetResult> {
  const intent = await startEsimSheet(locale, checkoutRef, method);
  const address = request.shippingAddress;
  const name =
    address?.fullName ?? [address?.firstName, address?.lastName].filter(Boolean).join(' ');
  const present = env.apiMock ? presentMockSheet : presentCardSheet;
  return present({
    publishableKey: intent.publishableKey,
    clientSecret: intent.clientSecret,
    merchantDisplayName: intent.merchantDisplayName,
    merchantCountryCode: intent.merchantCountryCode,
    testMode: intent.testMode,
    billing: {
      name: name || undefined,
      email: request.email,
      phone: request.phone ?? address?.phone,
    },
  });
}
