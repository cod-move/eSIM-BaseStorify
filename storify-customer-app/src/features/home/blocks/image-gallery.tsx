import { useState } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { ImageViewer } from '@/components/ui/image-viewer';
import type { ImageGalleryBlock } from '@/contracts/mobile/shop/v1';

import { BlockTitle } from './block-title';

/** A row of square pictures; a tap opens that picture, and a swipe moves on to the others. */
export function ImageGallery({ block }: { block: ImageGalleryBlock }) {
  const t = useTranslations('home.blocks.imageGallery');
  const [opened, setOpened] = useState<number | null>(null);

  if (block.images.length === 0) return null;

  return (
    <>
      {block.title ? <BlockTitle title={block.title} /> : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-3 px-4"
        className={block.title ? 'mt-3' : undefined}>
        {block.images.map((item, index) => (
          <Pressable
            key={item.id}
            accessibilityRole="imagebutton"
            accessibilityLabel={t('open', { position: index + 1, total: block.images.length })}
            onPress={() => setOpened(index)}
            className="active:opacity-80">
            <AppImage
              image={item.image}
              size="card"
              aspectRatio={1}
              className="w-36 rounded-2xl"
              decorative
            />
          </Pressable>
        ))}
      </ScrollView>
      <ImageViewer
        images={block.images.map((item) => item.image)}
        initialIndex={opened ?? 0}
        visible={opened !== null}
        onClose={() => setOpened(null)}
      />
    </>
  );
}
