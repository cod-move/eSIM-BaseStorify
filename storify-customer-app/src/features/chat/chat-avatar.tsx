import { View } from 'react-native';

import { AppImage } from '@/components/ui/app-image';
import { Text } from '@/components/ui/text';
import type { ImageSet } from '@/contracts/mobile/shop/v1';
import { cn } from '@/lib/cn';

const SIZES = {
  /** Beside a message. */
  sm: { frame: 'size-8', letter: 'text-sm leading-5' },
  /** In the header and the list. */
  md: { frame: 'size-11', letter: 'text-base leading-6' },
} as const;

type ChatAvatarProps = {
  /** Whose it is: the first letter stands in when there is no picture. */
  name: string;
  /** A picture from the API, or the shopper's own as a plain URL. */
  image?: ImageSet | string | undefined;
  /**
   * The picture is a brand's (a seller's logo, the store's icon): shown whole on
   * white, in dark mode too, so a transparent mark stays readable. A person's
   * photo fills the circle.
   */
  brand?: boolean;
  size: keyof typeof SIZES;
};

/** A round picture of one side of a conversation, or the first letter of its name. */
export function ChatAvatar({ name, image, brand = false, size }: ChatAvatarProps) {
  const styles = SIZES[size];
  const letter = Array.from(name.trim())[0]?.toUpperCase() ?? '';

  return (
    <View
      className={cn(
        'items-center justify-center overflow-hidden rounded-full',
        styles.frame,
        brand ? 'border border-border bg-logo-tile' : 'bg-surface-alt'
      )}>
      {image ? (
        <AppImage
          image={image}
          size="thumb"
          decorative
          contentFit={brand ? 'contain' : 'cover'}
          className="size-full bg-transparent"
        />
      ) : (
        <Text variant="label" className={cn('text-center', styles.letter)}>
          {letter}
        </Text>
      )}
    </View>
  );
}
