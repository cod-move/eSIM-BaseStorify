import { useScrollToTop } from 'expo-router';
import { useRef, type ComponentType } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
// [esim-patch] P50 (the header takes the safe area)

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { Reveal, useReveal } from '@/components/ui/motion';
import type { HomeBlock } from '@/contracts/mobile/shop/v1';

import { EsimHomeHeader } from '@/features/esim/home-header'; // [esim-patch] P50

import { HOME_BLOCK_VIEWS, UNDRAWN_BLOCKS } from './blocks';

type HomeScreenProps = {
  blocks: HomeBlock[];
  refreshing: boolean;
  onRefresh: () => void;
};

/** Home's content: the header, then the store's blocks in its order, 24 pt apart. */
export function HomeScreen({ blocks, refreshing, onRefresh }: HomeScreenProps) {
  // [esim-patch] P50 the safe area is the header's (src/features/esim/home-header.tsx).
  const tabBarHeight = useTabBarHeight();
  const reveal = useReveal();
  const shown = drawnBlocks(blocks);
  // A tap on the lit Home tab, while this page is open, brings it back to the top.
  const scroll = useRef<ScrollView>(null);
  useScrollToTop(scroll);

  // [esim-patch] P50 the eSIM header (logo, language, wishlist, cart) stays above the scrolling page.
  return (
    <View className="flex-1 bg-background">
      <EsimHomeHeader />
      <ScrollView
        ref={scroll}
        className="flex-1 bg-background"
        contentContainerClassName="gap-6"
        // The tab bar's space already holds the bar and the fade above it: a little more is enough.
        contentContainerStyle={{ paddingTop: 16, paddingBottom: tabBarHeight + 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {shown.map((block, index) => (
          <Reveal key={block.id} entering={reveal(index)}>
            <BlockView block={block} />
          </Reveal>
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * The blocks a phone draws: none of the kinds that draw nothing yet, and no spacer left at the
 * end, where it would only push the page past its last block.
 */
export function drawnBlocks(blocks: HomeBlock[]): HomeBlock[] {
  const drawn = blocks.filter((block) => !UNDRAWN_BLOCKS.has(block.type));
  let end = drawn.length;
  while (end > 0 && drawn[end - 1]?.type === 'SPACER') end -= 1;
  return drawn.slice(0, end);
}

function BlockView({ block }: { block: HomeBlock }) {
  // The map is keyed by the block's own kind, so the component takes this block.
  const View = HOME_BLOCK_VIEWS[block.type] as ComponentType<{ block: HomeBlock }>;
  return <View block={block} />;
}
