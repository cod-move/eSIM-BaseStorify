import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useUniwind } from 'uniwind';
import { useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { CountBadge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { SearchButton } from '@/components/ui/search-field';
import { Text } from '@/components/ui/text';
import { useCartCount } from '@/features/cart/use-cart';
import { useConfig } from '@/features/config/use-config';
import { useOpenLink } from '@/features/config/use-open-link';

/**
 * The top of Home: the store's logo, the wishlist and the cart with its
 * count, then the search field and the button to the categories.
 */
export function HomeHeader() {
  const t = useTranslations('home');
  const tCatalog = useTranslations('catalog');
  const router = useRouter();
  const openLink = useOpenLink();
  const { theme } = useUniwind();
  const cartCount = useCartCount();
  const config = useConfig().data;
  const store = config?.store;
  const logo = theme === 'dark' ? (store?.logoDark ?? store?.logo) : store?.logo;

  return (
    <View className="gap-4 px-4">
      <View className="flex-row items-center gap-1">
        <View
          accessible
          accessibilityRole="header"
          accessibilityLabel={store?.name}
          className="flex-1">
          {/* The store's logos are wordmarks: the name is written only when there is no logo. */}
          {logo ? (
            <AppImage
              image={logo}
              size="thumb"
              contentFit="contain"
              className="h-8 w-28 bg-transparent"
              decorative
            />
          ) : (
            <Text variant="display" numberOfLines={1}>
              {store?.name}
            </Text>
          )}
        </View>
        {config?.features.wishlist ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('wishlist')}
            onPress={() => openLink('/account/wishlist')}
            className="size-11 items-center justify-center active:opacity-80">
            <Icon name="heart" size={24} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            cartCount > 0
              ? tCatalog('labelWithCount', { label: t('cart'), count: cartCount })
              : t('cart')
          }
          onPress={() => router.push('/cart')}
          className="size-11 items-center justify-center active:opacity-80">
          <Icon name="cart" size={24} />
          <CountBadge count={cartCount} className="absolute end-0.5 top-1" />
        </Pressable>
      </View>
      <View className="flex-row items-center gap-3">
        <SearchButton
          label={t('search')}
          onPress={() => router.push('/search')}
          className="flex-1"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('categories')}
          onPress={() => router.push('/categories')}
          className="h-[46px] w-[52px] items-center justify-center rounded-full bg-surface active:opacity-80">
          <Icon name="list" size={22} />
        </Pressable>
      </View>
    </View>
  );
}
