import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { Text } from '@/components/ui/text';
import type { CollectionSummary } from '@/contracts/mobile/shop/v1';
import { cn } from '@/lib/cn';

import { collectionHref } from './collection-href';

/** A collection as a card: its picture, its title and how many products it holds. A tap opens it. */
export function CollectionCard({
  collection,
  className,
}: {
  collection: CollectionSummary;
  className?: string;
}) {
  const t = useTranslations('collections');
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={t('cardLabel', {
        title: collection.title,
        count: collection.productCount,
      })}
      onPress={() => router.push(collectionHref(collection.slug))}
      className={cn(
        'overflow-hidden rounded-lg border border-transparent bg-surface p-1 pb-3 shadow-card active:opacity-90 dark:border-border',
        className
      )}>
      <AppImage
        image={collection.image}
        size="card"
        contentFit="cover"
        aspectRatio={1}
        className="w-full rounded-md bg-surface-alt"
        decorative
      />
      <View className="gap-0.5 px-1.5 pt-2.5">
        <Text variant="product" numberOfLines={2}>
          {collection.title}
        </Text>
        <Text variant="caption" className="text-muted">
          {t('productCount', { count: collection.productCount })}
        </Text>
      </View>
    </Pressable>
  );
}
