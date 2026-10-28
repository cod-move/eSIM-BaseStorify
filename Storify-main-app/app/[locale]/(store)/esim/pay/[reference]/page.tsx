import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { paymentPage } from "@/lib/esim/payments/service";
import { EsimPayPage } from "@/components/esim/pay-page";
import { appPaymentReturnUrl } from "@/lib/checkout/app-payment-return";

interface PageProps {
  params: Promise<{ locale: string; reference: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const metadata: Metadata = { title: "Payment", robots: { index: false, follow: false } };

/**
 * The eSIM payment page (PAY, patch P15): Storify's checkout sends the
 * shopper here for the "extension" method; they pick a method, pay at the
 * gateway (or scan its QR code), and come back here until the order exists.
 */
export default async function EsimPaymentPage({ params, searchParams }: PageProps) {
  const { locale, reference } = await params;
  // Opened by the shopper app (APP-09): done or given up, back through the store's return bridge.
  const inApp = (await searchParams).app === "1";
  const appReturn = inApp
    ? { done: await appPaymentReturnUrl(locale, "extension", "return"), cancel: await appPaymentReturnUrl(locale, "extension", "cancel") }
    : null;
  setRequestLocale(locale);
  const view = await paymentPage(reference);
  if (!view) notFound();
  return (
    <div className="container mx-auto max-w-lg px-4 py-10">
      <EsimPayPage initial={view} appReturn={appReturn} />
    </div>
  );
}
