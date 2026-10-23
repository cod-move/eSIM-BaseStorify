import { useQuery } from '@tanstack/react-query';

import { getCouponList } from '@/api/endpoints/coupons-list';
import { etagQuery, selectData } from '@/api/etag-query';
import { queryKeys } from '@/api/query-keys';
import { useLocale } from '@/i18n/locale-store';

/**
 * The codes the store offers this shopper, judged for their cart, in the order
 * it sent them. Asked again each time the sheet opens (`open`), with the last
 * ETag, since the cart may have changed since.
 */
export function useCouponList(open: boolean) {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.couponList(locale),
    queryFn: etagQuery((options) => getCouponList(locale, options)),
    select: selectData,
    enabled: open,
    staleTime: 0,
  });
}
