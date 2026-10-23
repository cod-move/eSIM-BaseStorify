import { useRouter } from 'expo-router';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useTranslations } from 'use-intl';

import { EdgeFade } from '@/components/ui/edge-fade';
import type { CollectionListBlock } from '@/contracts/mobile/shop/v1';
import { CollectionCard } from '@/features/collections/collection-card';
import { COLLECTIONS_HREF } from '@/features/collections/collection-href';

import { BlockTitle } from './block-title';

/** The rail's side margin and the gap between its cards. */
const INSET = 16;
const GAP = 10;
/** Two cards show whole and a slice of the third, so the row reads as one that scrolls. */
const CARDS_IN_VIEW = 2.4;
/** The card shadow's reach above and below a card (`--shadow-card`: 0 6px 16px). */
const SHADOW_ROOM = { top: 12, bottom: 24 } as const;

/**
 * The store's collections as cards in a row that scrolls. A tap on a card opens that collection;
 * "View All" opens the list of every collection.
 */
export function CollectionList({ block }: { block: CollectionListBlock }) {
  const t = useTranslations('collections');
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cardWidth = (width - INSET - GAP * 2) / CARDS_IN_VIEW;

  return (
    <View className="gap-2">
      <BlockTitle
        title={block.title ?? t('title')}
        onViewAll={() => router.push(COLLECTIONS_HREF)}
      />
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          // Room above and below for the cards' shadows, which a sideways row would cut off, taken
          // back by the margins so the layout does not move.
          style={{ marginTop: -SHADOW_ROOM.top, marginBottom: -SHADOW_ROOM.bottom }}
          contentContainerStyle={{
            gap: GAP,
            paddingHorizontal: INSET,
            paddingTop: SHADOW_ROOM.top + 8,
            paddingBottom: SHADOW_ROOM.bottom,
          }}>
          {block.collections.map((collection) => (
            <View key={collection.id} style={{ width: cardWidth }}>
              <CollectionCard collection={collection} className="flex-1" />
            </View>
          ))}
        </ScrollView>
        <EdgeFade width={16} />
      </View>
    </View>
  );
}
