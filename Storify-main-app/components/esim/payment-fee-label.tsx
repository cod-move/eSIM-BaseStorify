"use client";

import { useTranslations } from "next-intl";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";

/** "Payment fee": the name of the fee's row beside shipping (patch P30). */
export function useEsimPaymentFeeLabel(): string {
  const t = useFallbackTranslator(useTranslations());
  return t("esim.pay.feeRow", "Payment fee");
}

/** The same name, as an element. */
export function EsimPaymentFeeLabel() {
  return <>{useEsimPaymentFeeLabel()}</>;
}
