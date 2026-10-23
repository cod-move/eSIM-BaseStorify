import { Stack, useRouter } from 'expo-router';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { CartContent } from '@/features/cart/cart-content';
import { useCart } from '@/features/cart/use-cart';
import { useRefresh } from '@/lib/use-refresh';

export default function CartScreen() {
  const t = useTranslations('cart');
  const router = useRouter();
  const tabBarHeight = useTabBarHeight();
  const cart = useCart();
  const { refreshing, onRefresh } = useRefresh(cart.refetch);

  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      {cart.isPending ? (
        <LoadingState />
      ) : cart.isError ? (
        <ErrorState error={cart.error} onRetry={onRefresh} />
      ) : cart.data.lines.length === 0 ? (
        <View className="flex-1 bg-background" style={{ paddingBottom: tabBarHeight }}>
          <EmptyState
            icon="bag"
            title={t('empty')}
            body={t('emptyBody')}
            action={<Button label={t('startShopping')} onPress={() => router.navigate('/')} />}
          />
        </View>
      ) : (
        <CartContent cart={cart.data} refreshing={refreshing} onRefresh={onRefresh} />
      )}
    </>
  );
}
