import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Skeleton, SkeletonTiles } from '@/components/ui/skeleton';

/**
 * Home's queues on their way, in the shape they will take, on its sheet: a
 * title and the four tiles. The header holds the figures' places itself.
 * Nothing is drawn as a zero before the store answers.
 */
export function HomeSkeleton() {
  const t = useTranslations('common');
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('loading')}
      className="gap-3">
      <Skeleton className="h-5 w-36" />
      <SkeletonTiles />
    </View>
  );
}
