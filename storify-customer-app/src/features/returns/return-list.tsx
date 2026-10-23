import { FlatList, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { Button } from '@/components/ui/button';
import type { ShopperReturn } from '@/contracts/mobile/shop/v1';

import { ReturnCard } from './return-card';

type ReturnListProps = {
  returns: ShopperReturn[];
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
};

/** The shopper's returns, newest first, with "Show more" while the store has more. */
export function ReturnList({ returns, hasMore, loadingMore, onMore }: ReturnListProps) {
  const t = useTranslations('returns');
  const tabBar = useTabBarHeight();

  return (
    <FlatList
      className="flex-1 bg-background"
      contentContainerClassName="gap-3 px-4 pt-3"
      contentContainerStyle={{ paddingBottom: tabBar + 16 }}
      data={returns}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <ReturnCard item={item} />}
      ListFooterComponent={
        hasMore ? (
          <View className="pt-1">
            <Button
              variant="outline"
              label={t('showMore')}
              loading={loadingMore}
              onPress={onMore}
            />
          </View>
        ) : null
      }
    />
  );
}
