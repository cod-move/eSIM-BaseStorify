import { useRouter, type Href } from 'expo-router';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { usePinnedPanelPadding } from '@/components/shell/tab-bar';
import type { Cart } from '@/contracts/mobile/shop/v1';

/** The checkout's path, the store website's. */
const CHECKOUT: Href = '/checkout';

/**
 * The panel pinned under the cart: "Total" with the store's subtotal,
 * "Excluding fees", and "Proceed to Checkout". Checkout waits while a line is
 * flagged. Its content stands above the floating tab bar's fade; the panel's
 * background runs on down behind the bar.
 */
export function CartSummary({ cart }: { cart: Cart }) {
  const t = useTranslations('cart');
  const router = useRouter();
  const bottom = usePinnedPanelPadding();
  const blocked = cart.lines.some((line) => line.reason !== undefined);

  return (
    <View
      style={{ paddingBottom: bottom }}
      className="gap-2 rounded-t-2xl bg-surface px-4 pt-3 shadow-bar">
      <View className="flex-row items-center justify-between gap-4">
        <Text variant="subheading" className="text-base font-bold">
          {t('total')}
        </Text>
        <Text variant="heading" className="text-lg">
          {cart.subtotal.formatted}
        </Text>
      </View>
      <View className="flex-row items-center justify-between gap-4">
        <Text variant="caption">{t('excludingFees')}</Text>
        <Text variant="caption">{t('itemCount', { count: cart.itemCount })}</Text>
      </View>
      {blocked ? (
        <Text variant="caption" className="text-warning">
          {t('checkoutBlocked')}
        </Text>
      ) : null}
      <Button
        label={t('checkout')}
        disabled={blocked}
        // Guests too: checkout itself sends a guest to sign in where the store requires it.
        onPress={() => router.push(CHECKOUT)}
      />
    </View>
  );
}
