import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Text } from '@/components/ui/text';
import type { EsimUsage } from '@/contracts/mobile/shop/v1/esim';

/**
 * What is left of the allowance: a bar and the store's own figures. An
 * unlimited plan shows only what has been used.
 */
export function UsageBar({ usage }: { usage: EsimUsage }) {
  const t = useTranslations('esim');

  if (usage.unlimited || usage.remainingPercent === undefined) {
    return (
      <Text variant="caption" className="text-muted">
        {t('usedOnly', { used: usage.used.formatted })}
      </Text>
    );
  }
  return (
    <View
      className="gap-1.5"
      accessible
      accessibilityLabel={t('remainingOf', {
        remaining: usage.remaining.formatted,
        total: usage.total.formatted,
      })}>
      <View className="h-2 overflow-hidden rounded-full bg-surface-alt">
        <View
          className="h-2 rounded-full bg-accent"
          style={{ width: `${usage.remainingPercent}%` }}
        />
      </View>
      <Text variant="caption" className="text-muted">
        {t('remainingOf', { remaining: usage.remaining.formatted, total: usage.total.formatted })}
      </Text>
    </View>
  );
}
