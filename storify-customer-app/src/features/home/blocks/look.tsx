import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { Text } from '@/components/ui/text';
import type { LookBlock } from '@/contracts/mobile/shop/v1';
import { useOpenLink } from '@/features/config/use-open-link';

import { BlockTitle } from './block-title';

/**
 * One styled outfit: its picture, which opens the look's collection, and the pieces in it as
 * tags under the picture, each opening its product. The contract places no tags on the picture, so
 * they sit in a row under it. "Add all to cart" is left to the product pages: a piece may need
 * a size or colour first.
 */
export function Look({ block }: { block: LookBlock }) {
  const t = useTranslations('home.blocks.look');
  const router = useRouter();
  const openLink = useOpenLink();

  return (
    <View className="gap-3">
      {block.title ? <BlockTitle title={block.title} /> : null}
      {block.subtitle ? (
        <Text variant="caption" className="px-4">
          {block.subtitle}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={t('openLook', { title: block.look.title })}
        onPress={() => openLink(`/collections/${block.look.slug}`)}
        className="mx-4 active:opacity-90">
        <AppImage
          image={block.image}
          size="full"
          aspectRatio={4 / 5}
          className="w-full rounded-2xl"
          decorative
        />
      </Pressable>
      {block.products.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 px-4">
          {block.products.map((product) => (
            <Pressable
              key={product.id}
              accessibilityRole="link"
              accessibilityLabel={product.name}
              onPress={() =>
                router.push({ pathname: '/products/[slug]', params: { slug: product.slug } })
              }
              className="min-h-11 w-50 flex-row items-center gap-2 rounded-xl border border-border bg-surface p-2 active:opacity-80">
              <AppImage
                image={product.image}
                size="thumb"
                className="size-12 rounded-lg"
                decorative
              />
              <View className="flex-1">
                <Text variant="product" numberOfLines={1}>
                  {product.name}
                </Text>
                {product.price ? <Text variant="caption">{product.price.formatted}</Text> : null}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
