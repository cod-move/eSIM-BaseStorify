/**
 * What a top-up line is called in the cart, checkout, the order and its
 * emails: the top-up and the eSIM it is for. Pure.
 */
export function topupLineLabel(quote: { name: string; iccid: string | null }): string {
  const tail = quote.iccid ? quote.iccid.replace(/F$/i, "").slice(-4) : null;
  return tail ? `${quote.name} · eSIM …${tail}` : quote.name;
}
