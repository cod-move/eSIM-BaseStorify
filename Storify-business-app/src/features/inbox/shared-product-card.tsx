import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { MessageProduct, ProductDetail } from '@/contracts/mobile/biz/v1';
import { useStockWords } from '@/features/products/product-row';
import { useProduct } from '@/features/products/use-products';
import { ProductStatusChip } from '@/features/status/status-chip';
import { useCan } from '@/features/workspace/use-workspace';

import type { ReplyProduct } from './thread-rows';

/**
 * A product shared in a conversation, as a card of its own beside the bubbles
 * (the shopper app's card, so both sides see the same thing): its picture at
 * the start; its name, the variant it was shared in and its price as the
 * message keeps them; and a chevron to the product.
 *
 * For an operator who may see products, the card also says what only the
 * product itself knows now: the variants it comes in, its stock, and its
 * status when it is not on sale (read once and cached, as the product's own
 * screen reads it). The card opens the product only once that read
 * succeeded: a product gone, or outside this workspace (another seller's in
 * the store's view), would open as "not found". The business app has no
 * cart, so the shopper's "Add to cart" is not here.
 */
export function SharedProductCard({ product }: { product: SharedProduct }) {
  const canProducts = useCan('VIEW_PRODUCTS');
  return canProducts ? <ReadProductCard product={product} /> : <ProductCard product={product} />;
}

type SharedProduct = MessageProduct | ReplyProduct;

/** The card of an operator who may see products: the product read, and opened once it was. */
function ReadProductCard({ product }: { product: SharedProduct }) {
  const now = useProduct(product.id).data;
  return <ProductCard product={product} now={now} />;
}

function ProductCard({ product, now }: { product: SharedProduct; now?: ProductDetail }) {
  const t = useTranslations('inbox.thread');
  const price = typeof product.price === 'string' ? product.price : product.price?.formatted;
  const variant = 'variantName' in product ? product.variantName : undefined;
  const opens = now !== undefined;

  return (
    <Pressable
      accessibilityRole={opens ? 'button' : undefined}
      accessibilityLabel={opens ? t('openProduct', { name: product.name }) : product.name}
      disabled={!opens}
      onPress={() => router.push({ pathname: '/products/[id]', params: { id: product.id } })}
      className="w-full flex-row items-center gap-3 rounded-[24px] border border-transparent bg-surface p-2.5 pe-4 shadow-card active:opacity-80 dark:border-border">
      <AppImage
        image={product.image}
        size="card"
        decorative
        className="size-[88px] rounded-2xl bg-surface-alt"
      />
      <View className="flex-1 justify-center gap-1">
        <Text variant="label" numberOfLines={2}>
          {product.name}
        </Text>
        {variant ? (
          <Text variant="caption" numberOfLines={1}>
            {variant}
          </Text>
        ) : null}
        <Text variant="price">{price ?? t('priceOnRequest')}</Text>
        {now ? <ProductNow product={now} variantShared={Boolean(variant)} /> : null}
      </View>
      {opens ? (
        <Icon name="chevron-right" size={20} directional colorClassName="accent-muted" />
      ) : null}
    </Pressable>
  );
}

/** The product as it is now: its variants (unless one was shared), its stock, and a status other than on sale. */
function ProductNow({
  product,
  variantShared,
}: {
  product: ProductDetail;
  variantShared: boolean;
}) {
  const t = useTranslations('inbox.thread');
  const common = useTranslations('common');
  const stockWords = useStockWords();
  const stock = stockWords(product);
  const variants = product.variants.map((entry) => entry.name);

  return (
    <>
      {!variantShared && variants.length > 1 ? (
        <Text variant="caption" numberOfLines={1}>
          {t('productVariants', {
            count: variants.length,
            names: variants.join(common('listSeparator')),
          })}
        </Text>
      ) : null}
      <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
        <Text variant="caption" className={stock.className}>
          {stock.text}
        </Text>
        {product.status !== 'active' ? <ProductStatusChip status={product.status} /> : null}
      </View>
    </>
  );
}
