import { View } from 'react-native';

import { RichText as RichTextView } from '@/components/ui/rich-text';
import { Text } from '@/components/ui/text';
import type { RichTextBlock } from '@/contracts/mobile/shop/v1';
import { useOpenLink } from '@/features/config/use-open-link';

/** The merchant's formatted text, under its heading when it has one. Links open as the store's links do. */
export function RichText({ block }: { block: RichTextBlock }) {
  const openLink = useOpenLink();

  return (
    <View className="gap-3 px-4">
      {block.heading ? (
        <Text variant="heading" accessibilityRole="header">
          {block.heading}
        </Text>
      ) : null}
      <RichTextView html={block.html} onLinkPress={openLink} />
    </View>
  );
}
