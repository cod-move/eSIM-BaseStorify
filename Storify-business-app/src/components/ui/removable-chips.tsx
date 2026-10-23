import { Pressable, ScrollView, View } from 'react-native';

import { cn } from '@/lib/cn';

import { TextLink } from './button';
import { Icon } from './icon';
import { Text } from './text';

export type RemovableChip<K extends string> = {
  key: K;
  label: string;
};

type RemovableChipsProps<K extends string> = {
  chips: readonly RemovableChip<K>[];
  /** What a screen reader says for a chip's button: "Remove filter: Kitchen". */
  removeLabel: (label: string) => string;
  onRemove: (key: K) => void;
  /** With two chips or more, a link at the end that takes them all off. */
  clearLabel?: string;
  onClear?: () => void;
  className?: string;
};

/**
 * What a list is filtered by, under its search: each filter that is on as a
 * `primary` chip with a cross at its end that takes it off. It scrolls from the
 * start edge when they do not fit.
 */
export function RemovableChips<K extends string>({
  chips,
  removeLabel,
  onRemove,
  clearLabel,
  onClear,
  className,
}: RemovableChipsProps<K>) {
  if (chips.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      className={cn('grow-0', className)}
      contentContainerClassName="items-center gap-2 px-4">
      {chips.map((chip) => (
        <Pressable
          key={chip.key}
          accessibilityRole="button"
          accessibilityLabel={removeLabel(chip.label)}
          onPress={() => onRemove(chip.key)}
          className="min-h-9 flex-row items-center gap-1 rounded-full bg-primary py-2 ps-4 pe-2.5 active:opacity-80">
          <Text variant="chip" numberOfLines={1} className="max-w-56 text-primary-foreground">
            {chip.label}
          </Text>
          <Icon name="close" size={16} colorClassName="accent-primary-foreground" />
        </Pressable>
      ))}
      {chips.length > 1 && clearLabel && onClear ? (
        <View className="px-2">
          <TextLink label={clearLabel} onPress={onClear} />
        </View>
      ) : null}
    </ScrollView>
  );
}
