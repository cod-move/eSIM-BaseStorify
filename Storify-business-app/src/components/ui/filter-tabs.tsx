import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View, type LayoutChangeEvent } from 'react-native';
import { useFormatter } from 'use-intl';

import { cn } from '@/lib/cn';

import { Text } from './text';

export type FilterTab<T extends string> = {
  value: T;
  label: string;
  /** A count beside the label, when the store sends one. */
  count?: number;
};

type FilterTabsProps<T extends string> = {
  tabs: readonly FilterTab<T>[];
  value: T;
  onChange: (value: T) => void;
  /** What a screen reader calls the row: "Order status". */
  label: string;
  className?: string;
};

/**
 * A row of filter chips under a list's header: the chosen one in `primary`, the
 * others on `surface`. It scrolls from the start edge when the chips do not
 * fit, and keeps the chosen chip in view.
 */
export function FilterTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: FilterTabsProps<T>) {
  const format = useFormatter();
  const scroll = useRef<ScrollView>(null);
  const [frames, setFrames] = useState<Partial<Record<T, { x: number; width: number }>>>({});
  const frame = frames[value];

  useEffect(() => {
    if (frame) scroll.current?.scrollTo({ x: Math.max(frame.x - 16, 0), animated: true });
  }, [frame]);

  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      accessibilityLabel={label}
      className={cn('grow-0', className)}
      contentContainerClassName="gap-2 px-4">
      {tabs.map((tab) => {
        const selected = tab.value === value;
        const count = tab.count !== undefined ? format.number(tab.count) : undefined;
        return (
          <Pressable
            key={tab.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={count ? `${tab.label}, ${count}` : tab.label}
            onPress={() => onChange(tab.value)}
            onLayout={(event: LayoutChangeEvent) => {
              const { x, width } = event.nativeEvent.layout;
              setFrames((all) =>
                all[tab.value]?.x === x && all[tab.value]?.width === width
                  ? all
                  : { ...all, [tab.value]: { x, width } }
              );
            }}
            className={cn(
              'min-h-9 flex-row items-center gap-1.5 rounded-full px-4 py-2 active:opacity-80',
              selected ? 'bg-primary' : 'bg-surface dark:bg-surface-alt'
            )}>
            <Text
              variant="chip"
              numberOfLines={1}
              className={selected ? 'text-primary-foreground' : undefined}>
              {tab.label}
            </Text>
            {count ? (
              <View
                className={cn(
                  'min-w-5 items-center rounded-full px-1.5',
                  selected ? 'bg-primary-foreground/20' : 'bg-surface-alt dark:bg-surface'
                )}>
                <Text
                  variant="badge"
                  className={cn('leading-4', selected && 'text-primary-foreground')}>
                  {count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
