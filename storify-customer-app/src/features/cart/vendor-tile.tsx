import { View } from 'react-native';

import { AppImage } from '@/components/ui/app-image';
import { CompactRating } from '@/components/ui/rating';
import { Text } from '@/components/ui/text';
import type { ImageSet, NamedLink } from '@/contracts/mobile/shop/v1';

import { useCartVendor } from './use-cart';

type VendorTileProps = {
  /** The seller of the group. Left out for the store's own lines. */
  vendor?: NamedLink;
  /** The store's name and logo, for its own lines. */
  storeName: string;
  storeLogo?: ImageSet;
};

/**
 * The seller tile above a group of cart lines: the logo, the name,
 * the rating and "N sold". A cart line carries only the seller's name, so the
 * rest comes from the seller's page; until it does, the tile shows the name.
 * A logo is contained, not cropped: a store's logo is often wide.
 */
export function VendorTile({ vendor, storeName, storeLogo }: VendorTileProps) {
  const detail = useCartVendor(vendor?.slug).data;
  const name = detail?.name ?? vendor?.name ?? storeName;
  const logo = vendor ? detail?.logo : storeLogo;

  return (
    <View className="flex-row items-center gap-4">
      <View className="size-[50px] items-center justify-center overflow-hidden rounded-xl bg-surface">
        {logo ? (
          <AppImage
            image={logo}
            size="thumb"
            className="size-[50px]"
            contentFit="contain"
            decorative
          />
        ) : (
          <Text variant="heading">{name.charAt(0)}</Text>
        )}
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="label" numberOfLines={1}>
          {name}
        </Text>
        {detail?.rating ? (
          <CompactRating
            rating={detail.rating}
            showAverage={false}
            showCount
            soldCount={detail.unitsSold > 0 ? detail.unitsSold : undefined}
          />
        ) : null}
      </View>
    </View>
  );
}
