import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { getComparison } from '@/api/endpoints/compare';
import { etagQuery, selectData } from '@/api/etag-query';
import { queryKeys } from '@/api/query-keys';
import type { ProductComparison } from '@/contracts/mobile/shop/v1';
import { useLocale } from '@/i18n/locale-store';

/**
 * The comparison without the products that are no longer picked: the columns
 * go, and so do the rows that only they had a value for, which is what the
 * store answers for the shorter list. It shows a removal at once, while the
 * store is asked again behind it.
 */
export function narrowComparison(
  comparison: ProductComparison,
  keep: readonly string[]
): ProductComparison {
  const kept = comparison.items.map((item) => keep.includes(item.slug));
  if (kept.every(Boolean)) return comparison;

  return {
    items: comparison.items.filter((_, index) => kept[index]),
    rows: comparison.rows
      .map((row) => ({ label: row.label, values: row.values.filter((_, index) => kept[index]) }))
      .filter((row) => row.values.some((value) => value !== '')),
  };
}

/**
 * The store's comparison of the picked products (`GET /compare`): their cards
 * and the specification rows, already lined up. Nothing is asked for an empty
 * pick. While a changed pick is on its way the last answer stays, narrowed to
 * what is still picked, so the table never blanks out.
 */
export function useComparison(slugs: readonly string[]) {
  const locale = useLocale();
  const query = useQuery({
    queryKey: queryKeys.compare(locale, slugs),
    queryFn: etagQuery((options) => getComparison(locale, slugs, options)),
    select: selectData,
    enabled: slugs.length > 0,
    placeholderData: keepPreviousData,
  });

  const data = useMemo(
    () => (query.data ? narrowComparison(query.data, slugs) : undefined),
    [query.data, slugs]
  );

  return { ...query, data };
}
