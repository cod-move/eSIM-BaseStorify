import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { VendorListBlock, VendorSummary } from '@/contracts/mobile/shop/v1';

/**
 * A seller as Home's vendor block and the vendor list send it. Home's carries
 * the units sold, the price tier and a tagline; the list's carries the number of
 * products. A card prints what it has.
 */
export type VendorCardData = Pick<
  VendorListBlock['vendors'][number],
  'slug' | 'name' | 'logo' | 'banner' | 'rating'
> &
  Partial<Pick<VendorListBlock['vendors'][number], 'tagline' | 'unitsSold' | 'priceTier'>> &
  Partial<Pick<VendorSummary, 'productCount'>>;

/**
 * A seller on Home and in the list of sellers: the cover with the logo over its
 * lower start corner, the name, one line about the seller, a strip of what the
 * store says of it (the rating when somebody reviewed it, units sold or products,
 * how expensive it is) and the "Go to Shop" button. The whole card opens the
 * seller's page.
 */
export function VendorCard({ vendor, width }: { vendor: VendorCardData; width: number }) {
  const t = useTranslations('vendor');
  const format = useFormatter();
  const router = useRouter();
  const open = () => router.push({ pathname: '/vendors/[slug]', params: { slug: vendor.slug } });

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={vendor.name}
      onPress={open}
      style={{ width }}
      className="overflow-hidden rounded-2xl bg-surface active:opacity-90">
      <View>
        <AppImage
          image={vendor.banner}
          size="card"
          aspectRatio={2.4}
          className="w-full bg-surface-alt"
          decorative
        />
        <AppImage
          image={vendor.logo}
          size="thumb"
          contentFit="contain"
          className="absolute start-3 -bottom-6 size-12 rounded-full border-2 border-surface bg-logo-tile"
          decorative
        />
      </View>
      <View className="gap-2.5 px-3 pt-8 pb-3">
        <View className="gap-1">
          <Text variant="subheading" numberOfLines={1}>
            {vendor.name}
          </Text>
          {vendor.tagline ? (
            <Text variant="caption" numberOfLines={1}>
              {vendor.tagline}
            </Text>
          ) : null}
        </View>
        <View className="flex-row rounded-xl bg-background py-2">
          {vendor.rating ? (
            <Stat label={t('rating')}>
              <View className="flex-row items-center gap-1">
                <Icon name="star" size={14} colorClassName="accent-rating" filled />
                <Text variant="label">
                  {format.number(vendor.rating.average, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}
                </Text>
              </View>
            </Stat>
          ) : null}
          {vendor.unitsSold !== undefined ? (
            <Stat label={t('sold')}>
              <Text variant="label">{format.number(vendor.unitsSold)}</Text>
            </Stat>
          ) : null}
          {vendor.productCount !== undefined ? (
            <Stat label={t('products')}>
              <Text variant="label">{format.number(vendor.productCount)}</Text>
            </Stat>
          ) : null}
          {vendor.priceTier ? (
            <Stat label={t('priceLevel')}>
              <Text variant="label">{vendor.priceTier}</Text>
            </Stat>
          ) : null}
        </View>
        <Button label={t('goToShop')} size="sm" onPress={open} />
      </View>
    </Pressable>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="flex-1 items-center gap-0.5">
      {children}
      <Text variant="caption">{label}</Text>
    </View>
  );
}
