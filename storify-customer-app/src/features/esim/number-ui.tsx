import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';

/** The pieces a number's screens share (NUM-03~09). */

/** A card of a tab: a title, an optional action beside it, and its body. */
export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View className="gap-3 rounded-xl bg-surface p-4">
      <View className="flex-row items-center justify-between gap-3">
        <Text variant="subheading" className="flex-1">
          {title}
        </Text>
        {action}
      </View>
      {children}
    </View>
  );
}

/** A label and its value on one line. */
export function Line({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-3">
      <Text className="flex-1 text-muted">{label}</Text>
      <Text className="shrink text-end" selectable>
        {value}
      </Text>
    </View>
  );
}

/** A small pill, as an eSIM's status: green, or red for `danger`. */
export function Pill({ label, danger }: { label: string; danger?: boolean }) {
  return (
    <View
      className={cn(
        'min-h-7 items-center justify-center self-start rounded-full border px-3 py-1',
        danger ? 'border-danger' : 'border-success'
      )}>
      <Text
        variant="caption"
        className={cn('font-semibold', danger ? 'text-danger' : 'text-success')}
        numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** A spoken-to-the-network section inside a panel: a bordered box with a title line. */
export function Section({
  title,
  aside,
  danger,
  children,
}: {
  title: string;
  aside?: ReactNode;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <View className={cn('gap-2 rounded-lg border p-3', danger ? 'border-danger' : 'border-border')}>
      <View className="flex-row items-center gap-2">
        <Text variant="label" className={cn('flex-1', danger && 'text-danger')}>
          {title}
        </Text>
        {aside}
      </View>
      {children}
    </View>
  );
}
