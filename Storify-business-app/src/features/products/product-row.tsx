import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { Icon } from '@/components/ui/icon';
import { Price } from '@/components/ui/price';
import { ListRow } from '@/components/ui/rows';
import { Text } from '@/components/ui/text';
import type { ImageSet, ProductListItem } from '@/contracts/mobile/biz/v1';
import { ProductStatusChip, useStatusLabel } from '@/features/status/status-chip';

/**
 * A product in a list: its picture, its
 * name, the seller for the store's own operators, "SKU · 12 in stock" with the
 * count in `warning` or `danger` when low or out, the price at the end and the
 * status chip under it.
 */

/** A product's thumbnail: its first picture, or a tag on a quiet tile while it has none. */
function ProductThumb({ image }: { image: ImageSet | undefined }) {
  if (!image) {
    return (
      <View className="size-11 items-center justify-center rounded-md bg-surface-alt">
        <Icon name="tag" size={20} colorClassName="accent-muted" />
      </View>
    );
  }
  return (
    <AppImage image={image} size="thumb" decorative className="size-11 rounded-md bg-surface-alt" />
  );
}

type Stocked = Pick<ProductListItem, 'stock' | 'lowStock' | 'untracked'>;

/** How many are in stock, in words, and the tone it reads in. */
export function useStockWords(): (product: Stocked) => { text: string; className?: string } {
  const t = useTranslations('products');
  return (product) => {
    if (product.untracked) return { text: t('untracked') };
    if (product.stock <= 0) return { text: t('outOfStock'), className: 'text-danger' };
    return {
      text: t('inStock', { count: product.stock }),
      className: product.lowStock ? 'text-warning' : undefined,
    };
  };
}

/** The price or the range of a product's variants, or "price on request". */
function usePriceWords(): (product: Pick<ProductListItem, 'price' | 'maxPrice'>) => string {
  const t = useTranslations('products');
  return ({ price, maxPrice }) => {
    if (!price) return t('onRequest');
    return maxPrice
      ? t('priceRange', { low: price.formatted, high: maxPrice.formatted })
      : price.formatted;
  };
}

type ProductRowProps = {
  product: ProductListItem;
  onPress: () => void;
  className?: string;
};

export function ProductRow({ product, onPress, className }: ProductRowProps) {
  const t = useTranslations('products');
  const status = useStatusLabel();
  const stockWords = useStockWords();
  const priceWords = usePriceWords();
  const stock = stockWords(product);
  const first = product.variantCount
    ? t('variantCount', { count: product.variantCount })
    : product.sku;

  let price: ReactNode;
  if (!product.price) {
    price = <Text variant="meta">{t('onRequest')}</Text>;
  } else if (product.maxPrice) {
    price = (
      <Text variant="price" numberOfLines={1}>
        {priceWords(product)}
      </Text>
    );
  } else {
    price = <Price money={product.price} />;
  }

  return (
    <ListRow
      leading={<ProductThumb image={product.image} />}
      title={product.name}
      titleEnd={price}
      subtitle={product.vendorName}
      meta={
        <Text variant="meta" numberOfLines={1}>
          {first ? `${first} · ` : null}
          <Text variant="meta" className={stock.className}>
            {stock.text}
          </Text>
        </Text>
      }
      metaEnd={<ProductStatusChip status={product.status} />}
      accessibilityLabel={[
        product.name,
        product.vendorName,
        priceWords(product),
        first,
        stock.text,
        status('product', product.status),
      ]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress}
      className={className}
    />
  );
}
