import { Pressable, ScrollView, View } from 'react-native';

import { AppImage } from '@/components/ui/app-image';
import { EdgeFade } from '@/components/ui/edge-fade';
import { Text } from '@/components/ui/text';
import type { LookListBlock } from '@/contracts/mobile/shop/v1';
import { useOpenLink } from '@/features/config/use-open-link';

import { BlockTitle } from './block-title';

/** A row of looks (outfits kept as collections), as pictures that scroll sideways; a tap opens the collection. */
export function LookList({ block }: { block: LookListBlock }) {
  const openLink = useOpenLink();
  if (block.looks.length === 0) return null;

  return (
    <View className="gap-3">
      {block.title ? <BlockTitle title={block.title} /> : null}
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-3 px-4">
          {block.looks.map((look) => (
            <Pressable
              key={look.id}
              accessibilityRole="link"
              accessibilityLabel={look.title}
              onPress={() => openLink(`/collections/${look.slug}`)}
              className="w-45 gap-2 active:opacity-80">
              <AppImage
                image={look.image}
                size="card"
                aspectRatio={block.aspectRatio}
                className="w-full rounded-xl"
                decorative
              />
              <Text variant="product" numberOfLines={2}>
                {look.title}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <EdgeFade />
      </View>
    </View>
  );
}
