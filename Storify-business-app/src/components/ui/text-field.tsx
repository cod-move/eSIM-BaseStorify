import { createContext, useContext, useState, type ReactNode, type Ref } from 'react';
import { Platform, TextInput, View, type TextInputProps } from 'react-native';
import { useTranslations } from 'use-intl';

import { cn } from '@/lib/cn';

import { Text } from './text';

/**
 * What a field sits on. On the page (`background`) the field is `surface`, a
 * white card in light mode; on a card or a sheet's body (`surface`) it steps
 * down to `surface-alt` so that it still shows. In dark mode it is
 * `surface-alt` on both.
 */
export type FieldSurface = 'background' | 'surface';

const FieldSurfaceContext = createContext<FieldSurface>('background');

/** Wraps what sits on a panel of its own: every field inside takes the panel's surface. */
export const FieldSurfaceProvider = FieldSurfaceContext.Provider;

/** The surface a field draws on: the one it is given, else the panel's it sits in, else the page. */
export function useFieldSurface(on?: FieldSurface): FieldSurface {
  const inherited = useContext(FieldSurfaceContext);
  return on ?? inherited;
}

type FieldBoxState = {
  on: FieldSurface;
  focused?: boolean;
  error?: boolean;
  disabled?: boolean;
};

/**
 * The box every field draws: the text field, the password field and the select
 * button. The outline is always there, transparent at rest, so that showing
 * focus or an error does not move what is inside.
 */
export function fieldBoxClass({ on, focused, error, disabled }: FieldBoxState) {
  return cn(
    'min-h-12 flex-row items-center rounded-md border-[1.5px] border-transparent',
    on === 'surface' ? 'bg-surface-alt' : 'bg-surface dark:bg-surface-alt',
    focused && 'border-foreground',
    error && 'border-danger',
    disabled && 'opacity-50'
  );
}

// Typed text starts at the reading edge, as `Text` does (see text.tsx). A
// browser draws its own focus ring on an input; the box shows focus instead.
const INPUT_PLATFORM = Platform.OS === 'web' ? 'text-start outline-none' : 'text-left';

/** The classes of the text inside a field's box. */
const FIELD_INPUT_CLASS = cn('flex-1 px-4 py-3 text-[15px] text-foreground', INPUT_PLATFORM);

type FieldLabelProps = {
  label: string;
  optional?: boolean;
  required?: boolean;
};

/**
 * The label above a field. Screen readers skip it: the control it names
 * carries the same words, so it would be read twice.
 */
export function FieldLabel({ label, optional = false, required = false }: FieldLabelProps) {
  const t = useTranslations('fields');

  return (
    <View
      className="flex-row flex-wrap items-baseline gap-x-1.5"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Text variant="label">
        {label}
        {required ? <Text className="text-danger">{` ${t('requiredMark')}`}</Text> : null}
      </Text>
      {optional ? <Text variant="caption">{t('optional')}</Text> : null}
    </View>
  );
}

/**
 * The line under a field: the error when there is one, else the helper text.
 * An error is announced the moment it appears.
 */
export function FieldMessage({ error, hint }: { error?: string; hint?: string }) {
  if (error) {
    return (
      <Text
        variant="caption"
        className="text-danger"
        accessibilityRole="alert"
        accessibilityLiveRegion="polite">
        {error}
      </Text>
    );
  }
  return hint ? <Text variant="caption">{hint}</Text> : null;
}

/** What a screen reader calls a field: its label, and whether it must be filled. */
export function useFieldName(label: string, { optional = false, required = false } = {}) {
  const t = useTranslations('fields');
  if (required) return `${label}, ${t('required')}`;
  if (optional) return `${label}, ${t('optional')}`;
  return label;
}

export type TextFieldProps = TextInputProps & {
  ref?: Ref<TextInput>;
  label: string;
  /** Shown under the field in `danger`, with a `danger` outline, and announced. */
  error?: string;
  /** A line of help under the field, when there is no error. */
  hint?: string;
  /** Marks the field "Optional" beside its label. */
  optional?: boolean;
  /** Marks the field with the required star. */
  required?: boolean;
  /** No label above the box, where the words around it name it already; screen readers still hear it. */
  hideLabel?: boolean;
  /** What the field sits on, where it is not the panel it is in: the page (the default), or a card. */
  on?: FieldSurface;
  /** Drawn inside the box at its end: the password field's eye, a copy button. */
  end?: ReactNode;
  /** Classes for the whole field (label, box and message), for layout: `flex-1`. */
  className?: string;
  /** Classes for the text input itself. */
  inputClassName?: string;
};

/**
 * A labelled text input. A form passes it the
 * field's error; it has no rules of its own. Every prop of React Native's
 * `TextInput`, and its `ref`, reach the input.
 */
export function TextField({
  ref,
  label,
  error,
  hint,
  optional,
  required,
  hideLabel = false,
  on,
  end,
  className,
  inputClassName,
  multiline,
  editable,
  onFocus,
  onBlur,
  ...props
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const name = useFieldName(label, { optional, required });
  const surface = useFieldSurface(on);
  const disabled = editable === false;

  const box = (
    <View
      className={cn(
        fieldBoxClass({ on: surface, focused, error: Boolean(error), disabled }),
        multiline && 'items-stretch'
      )}>
      <TextInput
        ref={ref}
        accessibilityLabel={name}
        accessibilityHint={error ?? hint}
        accessibilityState={{ disabled }}
        placeholderTextColorClassName="accent-muted"
        selectionColorClassName="accent-accent"
        editable={editable}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        className={cn(
          FIELD_INPUT_CLASS,
          multiline && 'min-h-28',
          end ? 'pe-1' : null,
          inputClassName
        )}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        {...props}
      />
      {end ? <View className="me-1 self-center">{end}</View> : null}
    </View>
  );

  return (
    <View className={cn('gap-2', className)}>
      {hideLabel ? null : <FieldLabel label={label} optional={optional} required={required} />}
      {box}
      <FieldMessage error={error} hint={hint} />
    </View>
  );
}
