import { FlashList } from '@shopify/flash-list';
import { Stack, useRouter } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { Button } from '@/components/ui/button';
import { RevealCard, useGridReveal } from '@/components/ui/motion';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/features/auth/use-session';
import { ProductCard } from '@/features/catalog/product-card';
import { useAddFromCard, useSetWishlisted, useWishlist } from '@/features/wishlist/use-wishlist';

/** The saved products in a two-column grid. A guest is asked to sign in: the store keeps no wishlist for guests. */
export default function WishlistScreen() {
  const t = useTranslations('wishlist');
  const router = useRouter();
  const { isSignedIn } = useSession();
  const list = useWishlist();
  const reveal = useGridReveal(list.isSuccess, 2);
  const setWishlisted = useSetWishlisted();
  const addFromCard = useAddFromCard();
  const toast = useToast();
  const bottom = useTabBarHeight();

  const header = <Stack.Screen options={{ title: t('title') }} />;

  if (!isSignedIn) {
    return (
      <>
        {header}
        <EmptyState
          icon="heart"
          title={t('guestTitle')}
          body={t('guestBody')}
          action={<Button label={t('signIn')} onPress={() => router.push('/login')} />}
        />
      </>
    );
  }
  if (list.isPending) return <LoadingState />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;

  const remove = (productId: string) =>
    setWishlisted.mutate(
      { productId, wishlisted: false },
      {
        onSuccess: () =>
          toast.show({
            message: t('removed'),
            action: {
              label: t('undo'),
              onPress: () => setWishlisted.mutate({ productId, wishlisted: true }),
            },
          }),
        onError: () => toast.show({ message: t('removeFailed') }),
      }
    );

  return (
    <View className="flex-1 bg-background">
      {header}
      <FlashList
        data={list.data}
        numColumns={2}
        {...reveal.list}
        keyExtractor={(item) => item.product.id}
        renderItem={({ item, index }) => (
          <RevealCard {...reveal.card(item.product.id, index)} className="flex-1">
            <ProductCard
              product={item.product}
              className="m-2 flex-1"
              isWishlisted
              onToggleWishlist={(product) => remove(product.id)}
              onAddToCart={addFromCard.add}
              busy={addFromCard.busyProductId === item.product.id}
            />
          </RevealCard>
        )}
        contentContainerStyle={{ padding: 8, paddingBottom: 8 + bottom }}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        refreshing={list.isRefetching && !list.isFetchingNextPage}
        onRefresh={() => void list.refetch()}
        ListEmptyComponent={
          <EmptyState
            icon="heart"
            title={t('emptyTitle')}
            body={t('emptyBody')}
            action={<Button label={t('startShopping')} onPress={() => router.navigate('/')} />}
          />
        }
        ListFooterComponent={
          list.isFetchingNextPage ? (
            <View className="p-4">
              <ActivityIndicator colorClassName="accent-muted" />
            </View>
          ) : null
        }
      />
    </View>
  );
}
