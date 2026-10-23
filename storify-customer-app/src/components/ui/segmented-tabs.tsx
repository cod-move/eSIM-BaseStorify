import { Pressable, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { cn } from '@/lib/cn';

import { badgeCount } from './badge';
import { Text } from './text';

export type SegmentedTab<T extends string> = {
  value: T;
  label: string;
  /** A count in a small pill after the label: none at zero, "99+" past 99. */
  count?: number;
};

type SegmentedTabsProps<T extends string> = {
  tabs: readonly SegmentedTab<T>[];
  value: T;
  onChange: (value: T) => void;
  /** What a screen reader calls the row: "Show". */
  label: string;
  className?: string;
};

/**
 * Two or three views of one list, side by side in a `surface-alt` track: the
 * chosen one raised on `surface`, the others in `muted`. Each takes an equal
 * share of the width.
 */
export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: SegmentedTabsProps<T>) {
  const t = useTranslations('catalog');
  const format = useFormatter();

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      className={cn('flex-row rounded-full bg-surface-alt p-1', className)}>
      {tabs.map((tab) => {
        const selected = tab.value === value;
        const shown = badgeCount(tab.count ?? 0);
        const count = shown
          ? shown.more
            ? t('countMore', { count: format.number(shown.value) })
            : format.number(shown.value)
          : null;
        return (
          <Pressable
            key={tab.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={count ? `${tab.label}, ${count}` : tab.label}
            onPress={() => onChange(tab.value)}
            className={cn(
              'min-h-9 flex-1 flex-row items-center justify-center gap-1.5 rounded-full px-3',
              selected ? 'bg-surface shadow-button' : 'active:opacity-70'
            )}>
            <Text
              variant="chip"
              numberOfLines={1}
              className={selected ? 'font-semibold' : 'text-muted'}>
              {tab.label}
            </Text>
            {count ? (
              <View className="h-[18px] min-w-[18px] items-center justify-center rounded-full bg-link px-1">
                {/* `background` on the fill, as on the count badges. */}
                <Text variant="badge" className="text-center text-background">
                  {count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
