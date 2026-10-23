import { View } from 'react-native';

import type { BannerBlock } from '@/contracts/mobile/shop/v1';

import { Slide } from '../slide';

/** One slide across the page's width, in the gutter. */
export function Banner({ block }: { block: BannerBlock }) {
  return (
    <View className="px-4">
      <View style={{ aspectRatio: block.aspectRatio }}>
        <Slide slide={block} className="flex-1" />
      </View>
    </View>
  );
}
