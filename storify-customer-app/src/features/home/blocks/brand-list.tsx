import { Pressable, ScrollView, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { EdgeFade } from '@/components/ui/edge-fade';
import type { BrandListBlock } from '@/contracts/mobile/shop/v1';
import { useOpenLink } from '@/features/config/use-open-link';

import { BlockTitle } from './block-title';

/**
 * The store's brands in a row that scrolls, as white tiles with the logo alone
 * (the name is its screen-reader label), whatever layout the store chose for its website. The
 * block has no title of its own, so it takes the app's. The tiles stay white in
 * dark mode. Stores upload logos as square pictures with the
 * wordmark across the middle, so the logo gets a square box as large as the
 * tile allows: in a wide, short box it would shrink to the box's height.
 */
export function BrandList({ block }: { block: BrandListBlock }) {
  const t = useTranslations('home');
  const openLink = useOpenLink();

  return (
    <View className="gap-4">
      <BlockTitle title={t('topBrands')} />
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2.5 px-4">
          {block.brands.map((brand) => (
            <Pressable
              key={brand.id}
              accessibilityRole="link"
              accessibilityLabel={brand.name}
              onPress={() => openLink(brand.href)}
              className="h-[66px] w-[104px] items-center justify-center rounded-2xl bg-logo-tile active:opacity-70">
              <AppImage
                image={brand.logo}
                size="thumb"
                contentFit="contain"
                className="size-16 bg-transparent"
                decorative
              />
            </Pressable>
          ))}
        </ScrollView>
        <EdgeFade />
      </View>
    </View>
  );
}
