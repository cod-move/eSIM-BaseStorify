import { ScrollView, useWindowDimensions, View } from 'react-native';
import { useTranslations } from 'use-intl';
import { EdgeFade } from '@/components/ui/edge-fade';

import type { VendorListBlock } from '@/contracts/mobile/shop/v1';
import { VendorCard } from '@/features/vendors/vendor-card';

import { BlockTitle } from './block-title';

/** The space between two cards, in points: the rail's `gap-3`. */
const GAP = 12;

/**
 * The store's best sellers in a row that scrolls a card at a time. A card takes
 * four fifths of the screen, so the next one shows at the edge.
 */
export function VendorList({ block }: { block: VendorListBlock }) {
  const t = useTranslations('vendor');
  const { width: screenWidth } = useWindowDimensions();
  const width = Math.round(screenWidth * 0.68);

  if (block.vendors.length === 0) return null;

  return (
    <View className="gap-4">
      <BlockTitle title={block.title ?? t('topVendors')} />
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={width + GAP}
          decelerationRate="fast"
          contentContainerClassName="gap-3 px-4">
          {block.vendors.map((vendor) => (
            <VendorCard key={vendor.id} vendor={vendor} width={width} />
          ))}
        </ScrollView>
        <EdgeFade />
      </View>
    </View>
  );
}
