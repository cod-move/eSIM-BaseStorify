import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUniwind } from 'uniwind';
import { useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { CountBadge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useCartCount } from '@/features/cart/use-cart';
import { useConfig } from '@/features/config/use-config';
import { useOpenLink } from '@/features/config/use-open-link';
import { useLocale } from '@/i18n/locale-store';

/**
 * Home's header in the eSIM store (patch P50): the store's logo, then the
 * language, the wishlist and the cart. It stays at the top while the page
 * scrolls under it; the search lives in the Search tab and the destinations'
 * search box, so it has no search row.
 */
export function EsimHomeHeader() {
  const t = useTranslations('home');
  const tEsim = useTranslations('esim');
  const tCatalog = useTranslations('catalog');
  const router = useRouter();
  const openLink = useOpenLink();
  const insets = useSafeAreaInsets();
  const { theme } = useUniwind();
  const cartCount = useCartCount();
  const locale = useLocale();
  const config = useConfig().data;
  const store = config?.store;
  const logo = theme === 'dark' ? (store?.logoDark ?? store?.logo) : store?.logo;

  return (
    <View
      className="flex-row items-center gap-1 border-b border-border bg-background px-4 pb-2"
      style={{ paddingTop: insets.top + 8 }}>
      <View accessible accessibilityRole="header" accessibilityLabel={store?.name} className="flex-1">
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tEsim('language')}
        onPress={() => router.push('/account/settings/language')}
        className="h-11 flex-row items-center gap-1 rounded-full px-2 active:opacity-80">
        <Icon name="globe" size={22} />
        <Text variant="caption" className="text-foreground">
          {locale.toUpperCase()}
        </Text>
      </Pressable>
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
  );
}
