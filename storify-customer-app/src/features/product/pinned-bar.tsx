import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { Button } from '@/components/ui/button';
import { Price } from '@/components/ui/price';
import { Text } from '@/components/ui/text';
import type { ProductDetail } from '@/contracts/mobile/shop/v1';

import type { ProductPurchase } from './use-product-purchase';

type PinnedBarProps = {
  product: ProductDetail;
  purchase: ProductPurchase;
  /** Scrolls the page back to the options. */
  onShowOptions: () => void;
};

/**
 * The bar pinned to the bottom once the buy buttons have scrolled away:
 * the picture, name, chosen options and price, then "Add". It
 * follows the same rules as the buy buttons; a tap on the product goes
 * back to the options.
 */
export function PinnedBar({ product, purchase, onShowOptions }: PinnedBarProps) {
  const t = useTranslations('product');
  const tCatalog = useTranslations('catalog');
  const insets = useSafeAreaInsets();
  const chosen = product.options
    .map((option) => option.values.find((value) => value.id === purchase.choice[option.id]))
    .flatMap((value) => (value ? [value.label] : []))
    .join(tCatalog('separator'));

  return (
    <View
      style={{ paddingBottom: Math.max(insets.bottom, 12) }}
      className="flex-row items-center gap-3 bg-surface px-4 pt-3 shadow-bar">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('backToOptions', { name: product.name })}
        onPress={onShowOptions}
        className="min-h-14 min-w-0 flex-1 flex-row items-center gap-3 active:opacity-80">
        <View className="size-14 overflow-hidden rounded-lg bg-surface-alt">
          <AppImage
            image={purchase.variant?.image ?? product.image}
            size="thumb"
            contentFit="contain"
            className="size-full"
            decorative
          />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="label" numberOfLines={1}>
            {product.name}
          </Text>
          {chosen ? (
            <Text variant="caption" className="text-muted" numberOfLines={1}>
              {chosen}
            </Text>
          ) : null}
          <Price
            price={purchase.price}
            from={purchase.from}
            onRequest={product.priceOnRequest}
            size="sm"
          />
        </View>
      </Pressable>
      <Button
        label={t('add')}
        icon="cart-plus"
        className="min-w-[94px] rounded-full px-4"
        // Without a choice yet, "Add" takes the shopper to the options to make one.
        disabled={purchase.block !== null && purchase.block !== 'chooseOptions'}
        loading={purchase.adding}
        onPress={purchase.block === 'chooseOptions' ? onShowOptions : purchase.addToCart}
      />
    </View>
  );
}
