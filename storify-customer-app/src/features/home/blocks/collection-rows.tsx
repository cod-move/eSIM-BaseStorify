import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';

import { AppImage } from '@/components/ui/app-image';
import { EdgeFade } from '@/components/ui/edge-fade';
import { Text } from '@/components/ui/text';
import type { CollectionRowsBlock } from '@/contracts/mobile/shop/v1';
import { ProductCard } from '@/features/catalog/product-card';
import { useCardActions } from '@/features/catalog/use-add-from-card';
import { COLLECTIONS_HREF, collectionHref } from '@/features/collections/collection-href';
import { cn } from '@/lib/cn';

import { Paint } from '../slide';
import { BlockTitle } from './block-title';

type Row = CollectionRowsBlock['rows'][number];

/** The rail's side margin and the gap between its cards. */
const INSET = 16;
const GAP = 10;
/** Two cards show whole and a slice of the third, so the row reads as one that scrolls. */
const CARDS_IN_VIEW = 2.4;
/** The card shadow's reach above and below a card (`--shadow-card`: 0 6px 16px). */
const SHADOW_ROOM = { top: 12, bottom: 24 } as const;

/**
 * The showcase panels: each collection as a panel painted as the store paints
 * it (its colour or gradient, or its picture), with the title and
 * a button on top and its products as cards that run over the panel's foot.
 */
export function CollectionRows({ block }: { block: CollectionRowsBlock }) {
  const router = useRouter();

  return (
    <View className="gap-8">
      {block.title ? (
        <BlockTitle title={block.title} onViewAll={() => router.push(COLLECTIONS_HREF)} />
      ) : null}
      {block.rows.map((row) => (
        <CollectionPanel key={row.id} row={row} />
      ))}
    </View>
  );
}

function CollectionPanel({ row }: { row: Row }) {
  const router = useRouter();
  const cardActions = useCardActions();
  const { width } = useWindowDimensions();
  const cardWidth = (width - INSET - GAP * 2) / CARDS_IN_VIEW;
  const [slide] = row.panel.slides;
  const title = slide?.heading ?? row.collection.title;
  const cta = slide?.cta;
  // The button always opens the collection in the app, whatever web link the store sent with it.
  const open = () => router.push(collectionHref(row.collection.slug));
  // The store paints its panels the same in both themes, so the title takes dark ink unless it sets its own.
  const ink = slide?.textColor ? { color: slide.textColor } : undefined;

  return (
    <View>
      {/* The panel ends under the cards' middle, so the cards stand over its foot. */}
      <View className="absolute inset-x-4 top-0 bottom-24 overflow-hidden rounded-2xl bg-surface-alt">
        {slide?.background ? <Paint paint={slide.background} /> : null}
        {slide?.image ? (
          <AppImage
            image={slide.image}
            size="full"
            contentFit="cover"
            className="absolute inset-0 bg-transparent"
            decorative
          />
        ) : null}
      </View>

      <View className="flex-row items-center justify-between gap-3 px-8 pt-6 pb-5">
        <Text
          variant="display"
          numberOfLines={1}
          accessibilityRole="header"
          className={cn('min-w-0 shrink', !ink && 'text-scrim')}
          style={ink}>
          {title}
        </Text>
        {cta?.label ? (
          // The store's "outline" button: a ring on the panel, the same in both themes as the panel is.
          // It takes the store's text colour like the title does, and dark ink when the store sets none.
          <Pressable
            accessibilityRole="link"
            onPress={open}
            className={cn(
              'min-h-10 items-center justify-center rounded-full border-[1.5px] px-5 active:opacity-70',
              !ink && 'border-scrim'
            )}
            style={ink ? { borderColor: ink.color } : undefined}>
            <Text
              variant="label"
              className={cn(!ink && 'text-scrim')}
              style={ink}
              numberOfLines={1}>
              {cta.label}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {row.products.length > 0 ? (
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            // Room above and below for the cards' shadows, which a sideways row would cut off, taken
            // back by the margins so the layout does not move.
            style={{ marginTop: -SHADOW_ROOM.top, marginBottom: -SHADOW_ROOM.bottom }}
            contentContainerStyle={{
              gap: GAP,
              paddingHorizontal: INSET + 12,
              paddingTop: SHADOW_ROOM.top,
              paddingBottom: SHADOW_ROOM.bottom,
            }}>
            {row.products.map((product) => (
              <View key={product.id} style={{ width: cardWidth }}>
                <ProductCard product={product} className="flex-1" {...cardActions(product)} />
              </View>
            ))}
          </ScrollView>
          <EdgeFade width={16} />
        </View>
      ) : null}
    </View>
  );
}
