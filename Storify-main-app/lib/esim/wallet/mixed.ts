/**
 * Whether cart lines mix a top-up with anything else (the payment fee aside),
 * which checkout refuses: a top-up is paid on its own (lib/esim/wallet/park.ts).
 * Pure, given the top-up products' variants and the fee's.
 */
export function mixesTopup(
  items: readonly { variantId?: unknown }[],
  topups: ReadonlySet<string>,
  feeVariantId?: string | null,
): boolean {
  const variantOf = (item: { variantId?: unknown }) => String(item.variantId ?? "");
  const lines = items.filter((item) => variantOf(item) !== (feeVariantId ?? ""));
  return lines.some((item) => topups.has(variantOf(item))) && lines.some((item) => !topups.has(variantOf(item)));
}
