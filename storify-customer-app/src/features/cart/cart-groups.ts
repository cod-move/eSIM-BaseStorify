import type { CartLine, NamedLink } from '@/contracts/mobile/shop/v1';

/** Lines shown in one card, under their seller's tile when there is one. */
export type CartGroup = {
  key: string;
  /** The seller. Left out for the store's own lines. */
  vendor?: NamedLink;
  /** Whether the group has a seller tile: only when the store has several sellers. */
  titled: boolean;
  lines: CartLine[];
};

/**
 * Splits the cart into the cards the screen draws. In marketplace
 * mode the lines are grouped by seller, in the order the store sent them, and
 * the lines with no seller form the store's own group. A single shop has one
 * card and no tiles.
 */
export function groupCartLines(lines: readonly CartLine[], multiVendor: boolean): CartGroup[] {
  if (!multiVendor) return [{ key: 'store', titled: false, lines: [...lines] }];

  const groups = new Map<string, CartGroup>();
  for (const line of lines) {
    const key = line.vendor ? `vendor:${line.vendor.slug}` : 'store';
    const group = groups.get(key) ?? { key, vendor: line.vendor, titled: true, lines: [] };
    group.lines.push(line);
    groups.set(key, group);
  }
  return [...groups.values()];
}
