import { View } from 'react-native';

import { Text, type TextVariant } from '@/components/ui/text';
import type { HeadingBlock } from '@/contracts/mobile/shop/v1';

const SIZES = {
  SMALL: 'heading',
  MEDIUM: 'title-large',
  LARGE: 'display',
} as const satisfies Record<HeadingBlock['size'], TextVariant>;

// The box's alignment places the text, so START and END follow the language's direction.
const ALIGN = {
  START: 'items-start',
  CENTER: 'items-center',
  END: 'items-end',
} as const satisfies Record<HeadingBlock['align'], string>;

/** A heading of its own; `accent` continues it in the accent colour, at the same size. */
export function Heading({ block }: { block: HeadingBlock }) {
  return (
    <View className={`px-4 ${ALIGN[block.align]}`}>
      <Text
        variant={SIZES[block.size]}
        accessibilityRole="header"
        className={block.align === 'CENTER' ? 'text-center' : undefined}>
        {block.title}
        {block.accent ? (
          <Text variant={SIZES[block.size]} className="text-accent">{` ${block.accent}`}</Text>
        ) : null}
      </Text>
    </View>
  );
}
