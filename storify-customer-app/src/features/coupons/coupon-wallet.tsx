import { setStringAsync } from 'expo-clipboard';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { useBottomSpace } from '@/components/shell/tab-bar';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';

import { CouponTicket } from './coupon-ticket';
import { useCouponList } from './use-coupon-list';

/**
 * The shopper's coupons, outside checkout: the codes the store offers them,
 * in its order, with its reasons. A usable code is copied, to be applied in
 * checkout's coupon sheet; the store judges it there.
 */
export function CouponWallet() {
  const t = useTranslations('coupons');
  const list = useCouponList(true);
  const bottom = useBottomSpace();
  const [copied, setCopied] = useState<string>();

  if (list.isPending) return <LoadingState />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  if (list.data.items.length === 0) {
    return <EmptyState icon="ticket" title={t('walletEmptyTitle')} body={t('walletEmptyBody')} />;
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-3 px-4 pt-4"
      contentContainerStyle={{ paddingBottom: bottom + 24 }}>
      <Text variant="body" className="px-1 text-muted">
        {t('walletIntro')}
      </Text>
      <View className="gap-3">
        {list.data.items.map((item) => {
          const done = copied === item.code;
          return (
            <CouponTicket
              key={item.code}
              coupon={item}
              state={item.usable ? 'available' : 'unavailable'}
              action={{
                label: done ? t('copied') : t('copy'),
                spoken: t('copyLabel', { code: item.code }),
              }}
              onApply={() => {
                setStringAsync(item.code)
                  .then(() => setCopied(item.code))
                  .catch(() => undefined);
              }}
            />
          );
        })}
      </View>
    </ScrollView>
  );
}
