import { Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Text } from '@/components/ui/text';

export function BlockTitle({ title, onViewAll }: { title: string; onViewAll?: () => void }) {
  const t = useTranslations('common');

  return (
    <View className="flex-row items-center justify-between px-4">
      <Text variant="heading">{title}</Text>
      {onViewAll ? (
        <Pressable
          accessibilityRole="link"
          onPress={onViewAll}
          hitSlop={8}
          className="active:opacity-80">
          <Text variant="label" className="text-primary">
            {t('viewAll')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
