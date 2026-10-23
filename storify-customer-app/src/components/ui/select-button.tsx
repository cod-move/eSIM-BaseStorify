import type { ReactNode } from 'react';
import { Pressable, View, type PressableProps } from 'react-native';

import { cn } from '@/lib/cn';

import { Icon, type IconName } from './icon';
import { Text } from './text';
import {
  fieldBoxClass,
  FieldLabel,
  FieldMessage,
  useFieldName,
  useFieldSurface,
  type FieldSurface,
} from './text-field';

export type SelectButtonProps = Omit<PressableProps, 'children'> & {
  /** The label above the box. Left out where the box sits beside another field's label (the country box). */
  label?: string;
  /** The chosen value, as the screen words it. */
  value?: string;
  /** Shown in `muted` while nothing is chosen. */
  placeholder?: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  required?: boolean;
  /** What the box sits on, where it is not the panel it is in: the page (the default), or a card. */
  on?: FieldSurface;
  /** The icon at the end: a chevron for a list of choices, `calendar` for a date. */
  icon?: IconName;
  /** Drawn at the start, before the value: a country's flag. */
  leading?: ReactNode;
  /** The choices are showing: the box keeps its focus outline while its sheet is up. */
  open?: boolean;
  className?: string;
};

/**
 * A field that is a button: it shows a value and opens something to choose it
 * with, a sheet of choices or the phone's date picker.
 * It looks like a text field so that a form reads as one piece.
 */
export function SelectButton({
  label,
  value,
  placeholder,
  error,
  hint,
  optional,
  required,
  on,
  icon = 'chevron-down',
  leading,
  open = false,
  disabled,
  className,
  ...props
}: SelectButtonProps) {
  const name = useFieldName(label ?? '', { optional, required });
  const surface = useFieldSurface(on);
  const shown = value || placeholder;

  return (
    <View className={cn('gap-2', className)}>
      {label ? <FieldLabel label={label} optional={optional} required={required} /> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[label ? name : null, shown].filter(Boolean).join(', ')}
        accessibilityHint={error ?? hint}
        accessibilityState={{ disabled: Boolean(disabled), expanded: open }}
        disabled={disabled}
        className={cn(
          fieldBoxClass({
            on: surface,
            focused: open,
            error: Boolean(error),
            disabled: Boolean(disabled),
          }),
          'gap-2 ps-5 pe-4 active:opacity-80'
        )}
        {...props}>
        {leading}
        <Text
          numberOfLines={1}
          className={cn('flex-1 py-3', value ? 'text-foreground' : 'text-muted')}>
          {shown}
        </Text>
        <Icon name={icon} size={20} colorClassName={value ? 'accent-foreground' : 'accent-muted'} />
      </Pressable>
      <FieldMessage error={error} hint={hint} />
    </View>
  );
}
