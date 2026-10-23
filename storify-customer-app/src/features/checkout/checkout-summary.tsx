import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { usePinnedPanelPadding } from '@/components/shell/tab-bar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import type { CheckoutTotals } from '@/contracts/mobile/shop/v1';

/**
 * The quote's totals, row by row, at the end of the page's content: Subtotal,
 * Discount, Shipping, Tax. Every figure is printed as the store sent it, a zero
 * included: the app weighs no amount. A row is left out only when the quote
 * leaves its field out.
 */
export function CheckoutBreakdown({ totals }: { totals: CheckoutTotals }) {
  const t = useTranslations('checkout');

  const rows: [string, string][] = [
    [t('subtotal'), totals.subtotal.formatted],
    [t('discount'), totals.discount.formatted],
    [t('shipping'), totals.shipping?.formatted ?? t('shippingLater')],
    ...(totals.duty ? [[t('duty'), totals.duty.formatted] as [string, string]] : []),
    [t('tax'), totals.tax.formatted],
  ];

  return (
    <View className="gap-1 rounded-2xl bg-surface px-4 py-3">
      {rows.map(([label, value]) => (
        <View key={label} className="flex-row items-center justify-between gap-4">
          <Text variant="body" className="text-sm text-muted">
            {label}
          </Text>
          <Text variant="body" className="text-sm">
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

type SummaryProps = {
  totals: CheckoutTotals;
  /** "Place order" may be tapped. */
  ready: boolean;
  placing: boolean;
  /** A sentence over the button: prices changed, a refusal. */
  notice?: string;
  onPlace: () => void;
};

/**
 * The bar pinned under checkout: "Total" and "Place order" with what is due
 * now. The rows that make up the total are in `CheckoutBreakdown`, in the page,
 * so the bar leaves the page its room. Its content stands above the floating
 * tab bar's fade, as the cart's does; the panel's background runs on down
 * behind the bar.
 */
export function CheckoutSummary({ totals, ready, placing, notice, onPlace }: SummaryProps) {
  const t = useTranslations('checkout');
  const bottom = usePinnedPanelPadding();

  return (
    <View style={{ paddingBottom: bottom }} className="gap-2 bg-surface px-4 pt-3 shadow-bar">
      <View className="flex-row items-center justify-between gap-4">
        <Text variant="subheading" className="text-lg font-bold">
          {t('total')}
        </Text>
        <Text variant="heading" className="text-lg">
          {totals.total.formatted}
        </Text>
      </View>
      {notice ? (
        <Text variant="caption" className="text-warning" accessibilityLiveRegion="polite">
          {notice}
        </Text>
      ) : null}
      <Button
        label={t('placeOrder')}
        variant="accent"
        trailing={totals.dueNow.formatted}
        disabled={!ready}
        loading={placing}
        onPress={onPlace}
      />
    </View>
  );
}
