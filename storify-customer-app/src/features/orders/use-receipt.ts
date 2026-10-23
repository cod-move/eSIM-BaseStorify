import { useMutation } from '@tanstack/react-query';

import { getGuestInvoice } from '@/api/endpoints/guest-tracking';
import { getInvoice } from '@/api/endpoints/orders';
import type { TrackOrderRequest } from '@/contracts/mobile/shop/v1';
import { useLocale } from '@/i18n/locale-store';

import { openPdf } from './open-pdf';

/** Whose receipt: the signed-in shopper's order, or a guest's found by its number and contact. */
export type ReceiptSource = { orderId: string } | { guest: TrackOrderRequest };

/**
 * The order's e-receipt: the store's invoice PDF, handed to the phone's
 * viewer or share sheet (in a browser, a tab of its own). A failure (no
 * connection, the store's refusal, nothing to open it with) is the mutation's
 * error.
 */
export function useReceipt(source: ReceiptSource) {
  const locale = useLocale();

  return useMutation({
    mutationFn: async () => {
      if ('guest' in source) {
        const bytes = await getGuestInvoice(locale, source.guest);
        await openPdf(bytes, source.guest.orderNumber);
        return;
      }
      const bytes = await getInvoice(locale, source.orderId);
      await openPdf(bytes, source.orderId);
    },
  });
}
