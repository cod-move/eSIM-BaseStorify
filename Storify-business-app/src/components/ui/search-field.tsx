import type { Ref } from 'react';
import { Platform, Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { useTranslations } from 'use-intl';

import { cn } from '@/lib/cn';

import { Icon } from './icon';
import { useFieldSurface } from './text-field';

export type SearchFieldProps = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  ref?: Ref<TextInput>;
  /** What a screen reader calls the field, and its placeholder: "Order number or customer". */
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  /** The keyboard's search key. */
  onSubmit?: (text: string) => void;
  /** Classes for the pill, for layout: `flex-1` beside the scan button. */
  className?: string;
};

/**
 * The search field: a 44 pt pill (`surface` on the page, `surface-alt` in
 * dark) with the search icon at the start and a button that clears what was
 * typed at the end. It searches nothing itself; the screen does that with
 * what it is given.
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
  const surface = useFieldSurface();

  return (
    <View
      className={cn(
        'h-11 flex-row items-center gap-2 rounded-full ps-4 pe-1',
        // On a card or a sheet it steps down to `surface-alt`, as a text field does.
        surface === 'surface' ? 'bg-surface-alt' : 'bg-surface dark:bg-surface-alt',
        className
      )}>
      <Icon name="search" size={20} colorClassName="accent-muted" />
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={() => onSubmit?.(value)}
        accessibilityRole="search"
        accessibilityLabel={label}
        placeholder={label}
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
          className="size-10 items-center justify-center rounded-full active:opacity-60">
          <Icon name="close" size={18} colorClassName="accent-muted" />
        </Pressable>
      ) : (
        <View className="size-2" />
      )}
    </View>
  );
}
