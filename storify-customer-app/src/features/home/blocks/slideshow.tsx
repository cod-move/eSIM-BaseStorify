import { View } from 'react-native';

import type { SlideshowBlock } from '@/contracts/mobile/shop/v1';

import { CategoryChips } from '../category-chips';
import { HeroCarousel } from '../hero-carousel';

/**
 * The store's hero: its departments as chips when it carries them, then one
 * endless carousel of every slide in the block. On the website the block may
 * be a grid of frames (a carousel and tiles beside it); on a phone they all
 * join the one carousel, in the grid's reading order, in the main carousel's
 * shape.
 */
export function Slideshow({ block }: { block: SlideshowBlock }) {
  const frames = block.rows?.flatMap((row) => row.columns.flat()) ?? [];
  const slides = frames.length > 0 ? frames.flatMap((frame) => frame.slides) : block.slides;

  return (
    <View className="gap-6">
      {block.showsCategories ? <CategoryChips /> : null}
      {slides.length > 0 ? (
        <HeroCarousel
          slides={slides}
          aspectRatio={block.aspectRatio}
          autoplaySeconds={block.autoplaySeconds}
        />
      ) : null}
    </View>
  );
}
