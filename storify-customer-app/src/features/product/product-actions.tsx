import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useErrorMessage } from '@/i18n/use-error-message';

import type { ProductPurchase } from './use-product-purchase';

/** Two equal buttons in a row, with the website's rounded corners instead of a pill. */
const BUTTON = 'min-w-0 flex-1 rounded-md px-3';

/**
 * "Add to Cart" and "Buy Now" side by side, the cart first. When the product cannot be bought,
 * the buttons give way to a line that says why: out of stock, a pre-order the
 * app does not take yet, a price on request, or not sold in the app.
 */
export function ProductActions({ purchase }: { purchase: ProductPurchase }) {
  const t = useTranslations('product');
  const describe = useErrorMessage();
  const { block } = purchase;

  return (
    <View className="gap-2">
      {block === null || block === 'chooseOptions' ? (
        <View className="flex-row gap-3">
          <Button
            variant="strong"
            label={purchase.added ? t('addedToCart') : t('addToCart')}
            icon="cart-plus"
            className={BUTTON}
            disabled={block !== null}
            loading={purchase.adding}
            onPress={purchase.addToCart}
          />
          <Button
            label={t('buyNow')}
            className={BUTTON}
            disabled={block !== null || purchase.adding}
            onPress={purchase.buyNow}
          />
        </View>
      ) : null}

      {block !== null ? (
        <View
          accessible
          accessibilityLiveRegion="polite"
          className="gap-1 rounded-lg bg-surface-alt px-4 py-3">
          <Text variant="label">{t(`block.${block}.title`)}</Text>
          <Text variant="caption" className="text-muted">
            {t(`block.${block}.body`)}
          </Text>
        </View>
      ) : purchase.preOrder ? (
        <Text variant="caption" className="text-muted">
          {t('preOrderNote')}
        </Text>
      ) : null}

      {purchase.error ? (
        <Text variant="caption" className="text-danger" accessibilityLiveRegion="polite">
          {describe(purchase.error)}
        </Text>
      ) : null}
    </View>
  );
}
