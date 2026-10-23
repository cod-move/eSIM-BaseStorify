import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { AppAsset, AppImage } from '@/components/ui/app-image';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { ImageSet } from '@/contracts/mobile/shop/v1';
import { cn } from '@/lib/cn';
import type { WashName } from '@/theme/tokens';
import { useWash } from '@/theme/use-wash';

/** The soft gradient behind the Account and Profile screens, in the mode's colours. */
export function Wash({ name }: { name: WashName }) {
  const wash = useWash(name);
  return (
    <LinearGradient
      colors={wash.colors}
      locations={wash.locations}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );
}

type AvatarProps = {
  /** The shopper's picture, `Me.image`; without one, a person outline stands in. */
  image?: ImageSet | undefined;
  /** `Me.imageUrl`, shown only when there is no `image`. */
  imageUrl?: string | undefined;
  /** 56 pt in the Account header, 110 pt on Profile. */
  size: 'md' | 'lg';
};

const SIZES = {
  md: { frame: 'size-14 p-[3px]', icon: 26 },
  lg: { frame: 'size-[110px] p-1', icon: 48 },
} as const;

/** The shopper's round picture in a ring of `surface`. */
export function Avatar({ image, imageUrl, size }: AvatarProps) {
  const t = useTranslations('account');
  const styles = SIZES[size];
  const picture = image ?? imageUrl;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={t('picture')}
      className={cn('overflow-hidden rounded-full bg-surface', styles.frame)}>
      {picture ? (
        <AppImage
          image={picture}
          size={size === 'md' ? 'thumb' : 'card'}
          decorative
          className="size-full rounded-full"
        />
      ) : (
        <View className="size-full items-center justify-center rounded-full bg-background">
          <Icon name="user" size={styles.icon} colorClassName="accent-muted" />
        </View>
      )}
    </View>
  );
}

/**
 * The Account tab's coloured pictures, one per place on it.
 */
const PICTURES = {
  wishlist: require('../../../assets/images/account/wishlist.png') as number,
  reviews: require('../../../assets/images/account/reviews.png') as number,
  coupons: require('../../../assets/images/account/coupons.png') as number,
  help: require('../../../assets/images/account/help.png') as number,
  orders: require('../../../assets/images/account/orders.png') as number,
  returns: require('../../../assets/images/account/returns.png') as number,
  tracking: require('../../../assets/images/account/tracking.png') as number,
} as const;

export type AccountPictureName = keyof typeof PICTURES;

/** One of the Account tab's pictures, fitted into a square: `size-8`. Screen readers skip it. */
export function AccountPicture({
  name,
  className,
}: {
  name: AccountPictureName;
  className: string;
}) {
  return (
    <View className={className}>
      <AppAsset source={PICTURES[name]} className="size-full" />
    </View>
  );
}

type TileProps = { picture: AccountPictureName; label: string; onPress: () => void };

/** A quick tile: a picture over a `chip` label, on `surface`, about 76 pt tall. */
export function QuickTile({ picture, label, onPress }: TileProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="min-h-[76px] flex-1 items-center justify-center gap-2 rounded-lg bg-surface p-2 active:opacity-80">
      <AccountPicture name={picture} className="size-8" />
      <Text variant="chip" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A purchase tile: a picture over a `subheading` label. */
export function Tile({ picture, label, onPress }: TileProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="min-h-20 flex-1 items-center justify-center gap-2 p-4 active:opacity-80">
      <AccountPicture name={picture} className="size-9" />
      <Text variant="subheading">{label}</Text>
    </Pressable>
  );
}
