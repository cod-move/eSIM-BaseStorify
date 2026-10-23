import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { clearCartToken } from '@/api/api';
import { mergeCart } from '@/api/endpoints/cart';
import { isApiError } from '@/api/errors';
import { PRIVATE_QUERIES } from '@/api/query-keys';
import { useLocale } from '@/i18n/locale-store';
import { reportError } from '@/lib/monitoring';
import { secureStorage } from '@/lib/secure-storage';
import { SECURE_KEYS } from '@/lib/storage-keys';

import { useSession } from './use-session';

/**
 * What has to happen whenever the person using the app changes, in one place.
 *
 * On sign-in the guest's cart is moved into the account's cart. On sign-in and
 * on sign-out, everything cached that belonged to the previous person (cart,
 * profile, wishlist) is dropped and asked for again, so one person never sees
 * another's data.
 *
 * Mounted once, in the root layout.
 */
export function useSessionSync(): void {
  const { user, isPending } = useSession();
  const userId = user?.id ?? null;
  const locale = useLocale();
  const queryClient = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (isPending) return;

    const before = previous.current;
    previous.current = userId;
    // The first answer tells who is using the app; nobody has changed yet.
    if (before === undefined || before === userId) return;

    const refresh = () => queryClient.resetQueries({ queryKey: PRIVATE_QUERIES });

    if (userId && secureStorage.getItem(SECURE_KEYS.cartToken)) {
      mergeCart(locale)
        .then(clearCartToken)
        .catch((error) => {
          // A guest cart the store no longer has cannot be merged; forget it.
          if (isApiError(error) && error.status === 404) clearCartToken();
          else reportError(error, { where: 'cart merge after sign-in' });
        })
        .finally(refresh);
    } else {
      void refresh();
    }
  }, [userId, isPending, locale, queryClient]);
}
