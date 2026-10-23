import { View } from 'react-native';

import type { ImageSet } from '@/contracts/mobile/biz/v1';
import { cn } from '@/lib/cn';

import { AppImage } from './app-image';
import { Icon, type IconName } from './icon';
import { Text } from './text';

const SIZES = {
  sm: { box: 'size-8', text: 'text-xs leading-4', icon: 16 },
  md: { box: 'size-10', text: 'text-sm leading-5', icon: 20 },
  lg: { box: 'size-14', text: 'text-lg leading-6', icon: 26 },
  /** The person's own picture on their account page: 110 pt with its 4 pt ring, as the shopper's Profile. */
  xl: { box: 'size-[102px]', text: 'text-3xl leading-9', icon: 44 },
} as const;

type AvatarSize = keyof typeof SIZES;

/** "Amina Rahman" → "AR"; one word gives one letter. Letters, not bytes: Bengali and Arabic names work too. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = [...(words[0] ?? '')][0] ?? '';
  const last = words.length > 1 ? ([...(words[words.length - 1] ?? '')][0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** A picture by its address, in the three sizes `AppImage` takes. */
function imageOf(url: string): ImageSet {
  return { thumb: url, card: url, full: url };
}

type AvatarProps = {
  /** The person's name: their initials stand in until a picture arrives, or when there is none. */
  name: string;
  /** The person's picture, when they have one. */
  imageUrl?: string;
  size?: AvatarSize;
  className?: string;
};

/**
 * A person: their picture in a circle, or their initials on `surface-alt`.
 * Decoration: the name beside it is what a screen reader reads.
 */
export function Avatar({ name, imageUrl, size = 'md', className }: AvatarProps) {
  const dimensions = SIZES[size];

  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      className={cn(
        'items-center justify-center overflow-hidden rounded-full bg-surface-alt',
        dimensions.box,
        className
      )}>
      <Text className={cn('font-semibold text-foreground', dimensions.text)}>
        {initialsOf(name)}
      </Text>
      {imageUrl ? (
        <AppImage
          image={imageOf(imageUrl)}
          size="thumb"
          decorative
          className={cn('absolute inset-0 bg-transparent', dimensions.box)}
        />
      ) : null}
    </View>
  );
}

type LogoTileProps = {
  /** The store's or the seller's logo. Without one, `icon` stands in. */
  logo?: ImageSet;
  icon?: IconName;
  size?: AvatarSize;
  className?: string;
};

/**
 * A logo on a white tile, in both themes: a logo is usually dark on
 * transparent and would vanish on a dark card (the house's fixed exception).
 */
export function LogoTile({ logo, icon = 'store', size = 'md', className }: LogoTileProps) {
  const dimensions = SIZES[size];

  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      className={cn(
        'items-center justify-center overflow-hidden rounded-lg',
        logo ? 'border border-border bg-logo-tile' : 'bg-surface-alt',
        dimensions.box,
        className
      )}>
      {logo ? (
        <AppImage
          image={logo}
          size="thumb"
          contentFit="contain"
          decorative
          className={cn('bg-transparent', dimensions.box)}
        />
      ) : (
        <Icon name={icon} size={dimensions.icon} colorClassName="accent-muted" />
      )}
    </View>
  );
}
