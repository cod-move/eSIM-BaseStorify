import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Price } from '@/components/ui/price';
import { CompactRating } from '@/components/ui/rating';
import { Text } from '@/components/ui/text';
import type { ChatMessageProduct, ProductOption } from '@/contracts/mobile/shop/v1';
import {
  cardAction,
  cardAvailability,
  useAddedToCart,
} from '@/features/catalog/product-card-parts';
import { useProduct } from '@/features/product/use-product';
import { useAddFromCard } from '@/features/wishlist/use-wishlist';

/** How many of an option's colours the card draws before "+2". */
const SWATCHES = 5;
/** How many options the card names; the product's page has them all. */
const OPTIONS = 2;

/**
 * A product shared in a chat, as a card of its own beside the bubbles (the
 * cart's row card): its picture at the start; its name, the option it was
 * shared in (or the options it comes in), its rating and its price; a chevron
 * to its page; and at the bottom end the cart button.
 *
 * The message keeps the product as it was when it was sent. What the card can
 * only know now (the rating, the options, whether it can be bought, its price
 * today) comes from the product's page in the store, read once and cached: until
 * it arrives, or when the product is no longer in the store, the card shows the
 * message's copy and no cart button. The button adds one, or opens the
 * product's page when an option has to be chosen, as a product card's does.
 */
export function SharedProduct({ product }: { product: ChatMessageProduct }) {
  const t = useTranslations('chat');
  const words = useTranslations('product');
  const catalog = useTranslations('catalog');
  const router = useRouter();
  const detail = useProduct(product.slug).data;
  const addFromCard = useAddFromCard();
  const busy = addFromCard.busyProductId === product.id;
  const added = useAddedToCart(product.id, busy) > 0 && !busy;
  const action = detail ? cardAction(detail) : null;
  const availability = detail ? cardAvailability(detail) : null;
  // A shared option keeps the price it was shared at; the product as a whole shows today's.
  const current = detail && !product.variantName ? detail : undefined;
  const open = () => router.push({ pathname: '/products/[slug]', params: { slug: product.slug } });

  return (
    <View className="w-full rounded-[24px] border border-transparent bg-surface p-2.5 pe-4 shadow-card dark:border-border">
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={t('openProduct', { name: product.name })}
        onPress={open}
        className="flex-row items-center gap-3 active:opacity-80">
        <View className="size-[88px] overflow-hidden rounded-2xl bg-surface-alt">
          {product.image ? (
            <AppImage
              image={product.image}
              size="card"
              decorative
              className="size-full bg-surface-alt"
            />
          ) : null}
        </View>
        <View className="flex-1 justify-center gap-1">
          <Text variant="label" numberOfLines={2}>
            {product.name}
          </Text>
          {product.variantName ? (
            <Text variant="caption" numberOfLines={1}>
              {product.variantName}
            </Text>
          ) : detail?.options.length ? (
            <Options options={detail.options.slice(0, OPTIONS)} />
          ) : null}
          {detail?.rating ? <CompactRating rating={detail.rating} showCount /> : null}
          <Price
            price={current ? current.price : product.price}
            compareAt={current ? current.compareAtPrice : product.compareAtPrice}
            from={current?.priceVaries ?? false}
            onRequest={current ? current.priceOnRequest : !product.price}
          />
          {availability ? (
            <Text variant="caption" className="font-semibold text-foreground">
              {catalog(availability)}
            </Text>
          ) : null}
        </View>
        <Icon name="chevron-right" size={20} directional colorClassName="accent-muted" />
      </Pressable>
      {detail && action ? (
        <View className="flex-row justify-end pt-2.5">
          <Button
            label={
              added
                ? words('addedToCart')
                : action === 'options'
                  ? words('chooseOptions')
                  : words('addToCart')
            }
            icon={added ? 'check' : 'cart-plus'}
            variant="strong"
            size="sm"
            loading={busy}
            onPress={() => addFromCard.add(detail)}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * The options a product comes in, one line each: colours as small swatches
 * ("+2" past five), any other option as its values ("256GB · 512GB").
 */
function Options({ options }: { options: ProductOption[] }) {
  const t = useTranslations('chat');

  return (
    <View className="gap-1">
      {options.map((option) => {
        const swatches = option.values.length > 0 && option.values.every((value) => value.swatch);
        const labels = option.values.map((value) => value.label);
        if (!swatches) {
          return (
            <Text
              key={option.id}
              variant="caption"
              numberOfLines={1}
              accessibilityLabel={`${option.name}: ${labels.join(', ')}`}>
              {labels.join(' · ')}
            </Text>
          );
        }
        const more = option.values.length - SWATCHES;
        return (
          <View
            key={option.id}
            accessible
            accessibilityLabel={`${option.name}: ${labels.join(', ')}`}
            className="flex-row items-center gap-1">
            {option.values.slice(0, SWATCHES).map((value) => (
              <View
                key={value.id}
                // The colour is the store's data for this value, not a colour of the app.
                style={{ backgroundColor: value.swatch }}
                className="size-3.5 rounded-full border border-border"
              />
            ))}
            {more > 0 ? <Text variant="caption">{t('moreOptions', { count: more })}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}
