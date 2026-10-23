import { View } from 'react-native';

import type { SponsoredRailBlock } from '@/contracts/mobile/shop/v1';

import { useSponsoredEvents } from '../sponsored-events';
import { BlockTitle } from './block-title';
import { ProductStrip } from './product-rail';

/**
 * The paid shelf. Every paid card carries the "Sponsored" label (the card draws
 * it from its own `sponsored` field), the title is the store's word and is shown
 * as it came, and the cards that were seen and opened are reported.
 */
export function SponsoredRail({ block }: { block: SponsoredRailBlock }) {
  const events = useSponsoredEvents('HOME');
  if (block.products.length === 0) return null;

  return (
    <View className="gap-3">
      <BlockTitle title={block.title} />
      <ProductStrip products={block.products} onSeen={events.seen} onOpen={events.opened} />
    </View>
  );
}
