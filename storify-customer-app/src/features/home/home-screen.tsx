import { useScrollToTop } from 'expo-router';
import { useRef, type ComponentType } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { Reveal, useReveal } from '@/components/ui/motion';
import type { HomeBlock } from '@/contracts/mobile/shop/v1';

import { HOME_BLOCK_VIEWS, UNDRAWN_BLOCKS } from './blocks';
import { HomeHeader } from './header';

type HomeScreenProps = {
  blocks: HomeBlock[];
  refreshing: boolean;
  onRefresh: () => void;
};

/** Home's content: the header, then the store's blocks in its order, 24 pt apart. */
export function HomeScreen({ blocks, refreshing, onRefresh }: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const reveal = useReveal();
  const shown = drawnBlocks(blocks);
  // A tap on the lit Home tab, while this page is open, brings it back to the top.
  const scroll = useRef<ScrollView>(null);
  useScrollToTop(scroll);

  return (
    <ScrollView
      ref={scroll}
      className="flex-1 bg-background"
      contentContainerClassName="gap-6"
      // The tab bar's space already holds the bar and the fade above it: a little more is enough.
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: tabBarHeight + 8 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <HomeHeader />
      {shown.map((block, index) => (
        <Reveal key={block.id} entering={reveal(index)}>
          <BlockView block={block} />
        </Reveal>
      ))}
    </ScrollView>
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
