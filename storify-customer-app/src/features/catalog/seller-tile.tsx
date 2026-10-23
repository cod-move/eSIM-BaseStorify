import { Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { Icon } from '@/components/ui/icon';
import { CompactRating } from '@/components/ui/rating';
import { Text } from '@/components/ui/text';
import type { VendorSummary } from '@/contracts/mobile/shop/v1';
import { cn } from '@/lib/cn';

/**
 * A seller of the store. A store with one shop has none to list: it shows
 * its brand, which is a name and a logo, so a brand without a rating fits.
 */
export type SellerTileVendor = Pick<VendorSummary, 'name' | 'logo' | 'rating'> &
  Partial<Pick<VendorSummary, 'verified' | 'productCount'>>;

type SellerTileProps = {
  vendor: SellerTileVendor;
  /** Opens the seller's page. Without it the tile is only a header. */
  onPress?: () => void;
  className?: string;
};

/**
 * The seller's header of the product page: the logo on a tile that stays white
 * in both themes (so any logo shows), the name with the verified mark when the
 * store sends it, and under it the star with the number of reviews and the
 * number of products. A seller nobody has reviewed shows what it has.
 */
export function SellerTile({ vendor, onPress, className }: SellerTileProps) {
  const t = useTranslations('product');
  const content = (
    <>
      <View className="h-[33px] w-12 items-center justify-center overflow-hidden rounded-lg bg-logo-tile p-0.5">
        <AppImage
          image={vendor.logo}
          size="thumb"
          contentFit="contain"
          className="size-full bg-transparent"
          decorative
        />
      </View>
      <View className="min-w-0 shrink gap-0.5">
        <View className="flex-row items-center gap-1">
          <Text variant="label" numberOfLines={1} className="shrink">
            {vendor.name}
          </Text>
          {vendor.verified ? (
            <View accessible accessibilityRole="image" accessibilityLabel={t('sellerVerified')}>
              <Icon name="check-circle" size={14} colorClassName="accent-link" />
            </View>
          ) : null}
        </View>
        {vendor.rating || vendor.productCount !== undefined ? (
          <View className="flex-row flex-wrap items-center gap-x-3">
            {vendor.rating ? (
              <CompactRating rating={vendor.rating} showAverage={false} showCount />
            ) : null}
            {vendor.productCount !== undefined ? (
              <Text variant="caption">{t('sellerProducts', { count: vendor.productCount })}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </>
  );
  const style = cn('min-h-11 flex-row items-center gap-3', className);

  return onPress ? (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      className={cn(style, 'active:opacity-80')}>
      {content}
    </Pressable>
  ) : (
    <View accessible className={style}>
      {content}
    </View>
  );
}
