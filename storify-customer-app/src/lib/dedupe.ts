/**
 * Drops the items whose `id` came earlier, keeping the first of each in place.
 *
 * A list of products can hold one card twice: a paid placement shown on the
 * first page comes again among the organic results of a later page, and the
 * first page can hold one card more than its limit. Two rows with one `id`
 * make a list render the same key twice.
 */
export function dedupeById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
