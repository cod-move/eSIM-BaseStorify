import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { cn } from '@/lib/cn';

import { Icon, type IconName } from './icon';
import { Text } from './text';

type ActionTileProps = {
  icon: IconName;
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  /** The action is on (a product picked to compare): the icon and the label take the accent colour. */
  active?: boolean;
};

/**
 * One action of an `ActionTiles` row: a card with its icon above a one-line
 * label, the same width as its neighbours, so the row reads as one set.
 */
export function ActionTile({ icon, label, onPress, accessibilityLabel, active }: ActionTileProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={active === undefined ? undefined : { selected: active }}
      onPress={onPress}
      className="min-h-16 flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface px-2 py-3 active:opacity-70">
      <Icon name={icon} size={20} colorClassName={active ? 'accent-accent' : 'accent-foreground'} />
      <Text
        variant="caption"
        numberOfLines={1}
        className={cn('text-center font-medium', active ? 'text-accent' : 'text-foreground')}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A row of equal action tiles. */
export function ActionTiles({ children, className }: { children: ReactNode; className?: string }) {
  return <View className={cn('flex-row gap-2', className)}>{children}</View>;
}
