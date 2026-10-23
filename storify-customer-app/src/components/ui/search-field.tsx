import type { Ref } from 'react';
import { Platform, Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { useTranslations } from 'use-intl';

import { cn } from '@/lib/cn';

import { Icon } from './icon';
import { Text } from './text';

// A pill, `surface` in light mode and `surface-alt` in dark.
// 46 pt tall: the design's 40 at its 2× scale, on a real phone.
const PILL = 'h-[46px] flex-row items-center rounded-full bg-surface dark:bg-surface-alt';

export type SearchFieldProps = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  ref?: Ref<TextInput>;
  /** What a screen reader calls the field: "Search products". */
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  /** The keyboard's search key, or the search button at the end. */
  onSubmit?: (text: string) => void;
  /** Classes for the pill, for layout: `flex-1` beside the filter button. */
  className?: string;
};

/**
 * The search field: a pill with the search button at its end, and a button
 * that clears what was typed. It searches nothing itself; the screen does
 * that with what `onSubmit` hands it.
 */
export function SearchField({
  ref,
  label,
  value,
  onChangeText,
  onSubmit,
  className,
  ...props
}: SearchFieldProps) {
  const t = useTranslations('fields');

  return (
    <View className={cn(PILL, 'ps-5 pe-1', className)}>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={() => onSubmit?.(value)}
        accessibilityRole="search"
        accessibilityLabel={label}
        placeholderTextColorClassName="accent-muted"
        selectionColorClassName="accent-accent"
        returnKeyType="search"
        inputMode="search"
        autoCapitalize="none"
        autoCorrect={false}
        // The clear button below replaces the one iOS would draw.
        clearButtonMode="never"
        className={cn(
          'h-full flex-1 text-[15px] text-foreground',
          Platform.OS === 'web' ? 'text-start outline-none' : 'text-left'
        )}
        {...props}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('clearSearch')}
          onPress={() => onChangeText('')}
          className="size-11 items-center justify-center rounded-full active:opacity-60">
          <Icon name="close" size={18} colorClassName="accent-muted" />
        </Pressable>
      ) : null}
      {onSubmit ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('search')}
          onPress={() => onSubmit(value)}
          className="size-11 items-center justify-center rounded-full active:opacity-60">
          <Icon name="search" size={22} />
        </Pressable>
      ) : (
        <View className="size-11 items-center justify-center">
          <Icon name="search" size={22} />
        </View>
      )}
    </View>
  );
}

type SearchButtonProps = {
  /** The field's placeholder, which is also what a screen reader reads: "Search products". */
  label: string;
  onPress: () => void;
  className?: string;
};

/**
 * The search field as Home shows it: the same pill, which opens the search
 * screen instead of taking text.
 */
export function SearchButton({ label, onPress, className }: SearchButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className={cn(PILL, 'gap-2 ps-5 pe-3.5 active:opacity-80', className)}>
      <Text numberOfLines={1} className="flex-1 text-muted">
        {label}
      </Text>
      <Icon name="search" size={22} />
    </Pressable>
  );
}
