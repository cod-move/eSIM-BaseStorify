import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { WaitingReview } from '@/contracts/mobile/shop/v1';

type WaitingReviewsProps = {
  items: WaitingReview[];
  /** The store could not be asked; a retry is offered in their place. */
  failed: boolean;
  retrying: boolean;
  onRetry: () => void;
};

/**
 * The products delivered to the shopper and not reviewed yet, under
 * "Waiting for your review (N)". Each opens its product page, and Write opens
 * the write-review sheet. A failure says so, with Try again, rather than
 * leaving the shopper to think nothing is waiting. Draws nothing while there
 * are none, or while the list is on its way.
 */
export function WaitingReviews({ items, failed, retrying, onRetry }: WaitingReviewsProps) {
  const t = useTranslations('myReviews');
  const router = useRouter();

  if (failed) {
    return (
      <View className="flex-row items-center gap-3 rounded-xl bg-surface p-3">
        <Icon name="warning" size={20} colorClassName="accent-muted" />
        <Text variant="caption" className="flex-1">
          {t('waitingError')}
        </Text>
        <Button
          label={t('waitingRetry')}
          size="sm"
          variant="outline"
          loading={retrying}
          onPress={onRetry}
        />
      </View>
    );
  }
  if (items.length === 0) return null;

  return (
    <View className="gap-3">
      <Text variant="heading" accessibilityRole="header">
        {t('waitingTitle', { count: items.length })}
      </Text>
      {items.map(({ product, orderId, orderNumber }) => {
        const slug = product.slug;
        const about = (
          <>
            <AppImage
              image={product.image}
              size="thumb"
              className="size-14 rounded-md"
              decorative
            />
            <View className="flex-1 gap-0.5">
              <Text variant="label" numberOfLines={2}>
                {product.name}
              </Text>
              <Text variant="caption">{t('waitingOrder', { number: orderNumber })}</Text>
            </View>
          </>
        );
        return (
          <View
            key={`${orderId}:${product.id}`}
            className="flex-row items-center gap-3 rounded-xl bg-surface p-3">
            {slug ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={t('waitingOpen', { name: product.name })}
                onPress={() => router.push({ pathname: '/products/[slug]', params: { slug } })}
                className="min-h-11 flex-1 flex-row items-center gap-3 active:opacity-80">
                {about}
              </Pressable>
            ) : (
              <View className="flex-1 flex-row items-center gap-3">{about}</View>
            )}
            {slug ? (
              <Button
                label={t('write')}
                size="sm"
                variant="accent"
                accessibilityLabel={t('writeLabel', { name: product.name })}
                onPress={() =>
                  router.push({ pathname: '/products/[slug]/write-review', params: { slug } })
                }
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
