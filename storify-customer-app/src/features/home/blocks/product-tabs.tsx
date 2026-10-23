import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeInLeft, FadeInRight } from 'react-native-reanimated';
import { useTranslations } from 'use-intl';

import { Chip } from '@/components/ui/chip';
import { EdgeFade } from '@/components/ui/edge-fade';
import { Text } from '@/components/ui/text';
import type { ProductTabsBlock } from '@/contracts/mobile/shop/v1';
import { useRtl } from '@/i18n/use-rtl';

import { BlockTitle } from './block-title';
import { ProductStrip } from './product-rail';

/** Tabs that switch the row of products beneath them. The first tab shows first. */
export function ProductTabs({ block }: { block: ProductTabsBlock }) {
  const t = useTranslations('catalog');
  const rtl = useRtl();
  const [activeId, setActiveId] = useState(block.tabs[0]?.id);
  const active = block.tabs.find((tab) => tab.id === activeId) ?? block.tabs[0];
  if (!active) return null;

  return (
    <View className="gap-3">
      {block.title ? <BlockTitle title={block.title} /> : null}
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 px-4">
          {block.tabs.map((tab) => (
            <Chip
              key={tab.id}
              label={tab.label}
              selected={tab.id === active.id}
              onPress={() => setActiveId(tab.id)}
            />
          ))}
        </ScrollView>
        <EdgeFade />
      </View>
      {active.products.length > 0 ? (
        // A new tab's products slide in from the end and fade up, so the switch reads as one.
        <Animated.View key={active.id} entering={(rtl ? FadeInLeft : FadeInRight).duration(320)}>
          <ProductStrip products={active.products} />
        </Animated.View>
      ) : (
        <Text variant="caption" className="px-4">
          {t('empty')}
        </Text>
      )}
    </View>
  );
}
