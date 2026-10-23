import { useWindowDimensions, View } from 'react-native';

import { AppImage } from '@/components/ui/app-image';
import { Button } from '@/components/ui/button';
import { RichText } from '@/components/ui/rich-text';
import { Text } from '@/components/ui/text';
import type { ImageTextBlock } from '@/contracts/mobile/shop/v1';
import { useOpenLink } from '@/features/config/use-open-link';

/** From this width (pt) the picture and the text sit side by side; on a phone they stack. */
const SIDE_BY_SIDE_WIDTH = 600;

/**
 * A picture and formatted text. The picture comes first when the block says START: above the text
 * on a phone, at the start edge (the right one in Arabic) on a tablet.
 */
export function ImageText({ block }: { block: ImageTextBlock }) {
  const openLink = useOpenLink();
  const { width } = useWindowDimensions();
  const wide = width >= SIDE_BY_SIDE_WIDTH;
  const href = block.cta?.href;

  const picture = block.image ? (
    <View className={wide ? 'flex-1' : undefined}>
      <AppImage
        image={block.image}
        size="card"
        aspectRatio={4 / 3}
        className="w-full rounded-2xl"
      />
    </View>
  ) : null;

  const copy = (
    <View className={wide ? 'flex-1 gap-3' : 'gap-3'}>
      {block.heading ? (
        <Text variant="heading" accessibilityRole="header">
          {block.heading}
        </Text>
      ) : null}
      {block.html ? <RichText html={block.html} onLinkPress={openLink} /> : null}
      {block.cta && href ? (
        <Button
          label={block.cta.label}
          onPress={() => openLink(href)}
          accessibilityRole="link"
          className="self-start"
        />
      ) : null}
    </View>
  );

  const pictureFirst = block.imagePosition !== 'END';

  return (
    <View className={wide ? 'flex-row items-center gap-4 px-4' : 'gap-4 px-4'}>
      {pictureFirst ? picture : copy}
      {pictureFirst ? copy : picture}
    </View>
  );
}
