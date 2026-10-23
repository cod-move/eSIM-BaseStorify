import { Fragment, useEffect, useState, type Ref } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { cn } from '@/lib/cn';

import { Text } from './text';
import {
  FieldLabel,
  FieldMessage,
  useFieldName,
  useFieldSurface,
  type FieldSurface,
} from './text-field';

// The zero of each set of digits a phone keyboard may type: Western, Arabic,
// Persian (and Urdu), Devanagari, Bengali. The store wants 0 to 9.
const ZEROS = [0x30, 0x660, 0x6f0, 0x966, 0x9e6];

/**
 * The code in `text`: its digits, as 0 to 9, at most `length` of them. Spaces,
 * dashes and words around a pasted code ("Your code is 123 456") fall away.
 */
export function toCode(text: string, length: number): string {
  let code = '';
  for (const char of text) {
    const point = char.codePointAt(0) ?? 0;
    const zero = ZEROS.find((start) => point >= start && point <= start + 9);
    if (zero !== undefined) code += String(point - zero);
    if (code.length === length) break;
  }
  return code;
}

/**
 * The code after the hidden input changed from `previous` to `text`. A whole
 * code pasted or filled in after a few typed digits replaces them, instead of
 * being cut off behind them.
 */
function nextCode(previous: string, text: string, length: number): string {
  if (text.startsWith(previous)) {
    const added = toCode(text.slice(previous.length), length);
    if (added.length === length) return added;
  }
  return toCode(text, length);
}

type CodeInputProps = Pick<
  TextInputProps,
  'autoFocus' | 'editable' | 'onFocus' | 'onBlur' | 'onSubmitEditing' | 'returnKeyType' | 'testID'
> & {
  ref?: Ref<TextInput>;
  /** "Your 6-digit code". Screen readers read it as the field's name. */
  label: string;
  value: string;
  onChangeText: (code: string) => void;
  /** Called once the last digit is in, to move on without a button. */
  onComplete?: (code: string) => void;
  /** How many digits the store sends. */
  length?: number;
  /** Outlines every box in `danger`, shows the message under them and shakes the row once. */
  error?: string;
  required?: boolean;
  /** What the boxes sit on, where it differs from the panel they are in (a sheet gives them its own). */
  on?: FieldSurface;
  className?: string;
};

/**
 * The one-time code of sign-up and two-step verification: a row of boxes, one per digit.
 *
 * The boxes are a drawing. One text input lies over them, nearly invisible,
 * and takes everything: typing, pasting a whole code, and the code the phone
 * offers from a message (iOS `oneTimeCode`, Android `sms-otp`). So it is one
 * field for screen readers too. It is not fully transparent: iOS may not offer
 * its one-time code to a field that cannot be seen at all.
 *
 * The digits run left to right in every language, Arabic included.
 */
export function CodeInput({
  ref,
  label,
  value,
  onChangeText,
  onComplete,
  length = 6,
  error,
  required,
  on,
  className,
  editable,
  onFocus,
  onBlur,
  ...props
}: CodeInputProps) {
  const [focused, setFocused] = useState(false);
  const surface = useFieldSurface(on);
  const name = useFieldName(label, { required });
  const code = toCode(value, length);
  const disabled = editable === false;
  const shake = useShake(error);

  const change = (text: string) => {
    const next = nextCode(code, text, length);
    if (next === code) return;
    onChangeText(next);
    if (next.length === length) onComplete?.(next);
  };

  return (
    <View className={cn('gap-3', className)}>
      <FieldLabel label={label} required={required} />
      <Animated.View style={{ transform: [{ translateX: shake }] }}>
        <View
          // Left to right whatever the language: a code is read digit by digit
          // in the order it was sent.
          style={{ direction: 'ltr' }}
          className={cn('flex-row items-center gap-2', disabled && 'opacity-50')}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          {Array.from({ length }, (_, index) => (
            <Fragment key={index}>
              {length % 2 === 0 && index === length / 2 ? (
                <View className="size-1.5 rounded-full bg-muted" />
              ) : null}
              <CodeBox
                digit={code[index]}
                active={focused && index === Math.min(code.length, length - 1)}
                error={Boolean(error)}
                on={surface}
              />
            </Fragment>
          ))}
        </View>
        <TextInput
          ref={ref}
          value={code}
          onChangeText={change}
          accessibilityLabel={name}
          accessibilityHint={error}
          accessibilityState={{ disabled }}
          editable={editable}
          keyboardType="number-pad"
          inputMode="numeric"
          textContentType="oneTimeCode"
          autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
          autoCorrect={false}
          caretHidden
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          className={cn(
            'absolute inset-0 text-transparent opacity-[0.02]',
            Platform.OS === 'web' && 'outline-none'
          )}
          {...props}
        />
      </Animated.View>
      <FieldMessage error={error} />
    </View>
  );
}

type CodeBoxProps = {
  digit: string | undefined;
  /** The box the next digit goes into, while the field has focus. */
  active: boolean;
  error: boolean;
  on: FieldSurface;
};

function CodeBox({ digit, active, error, on }: CodeBoxProps) {
  const fill = on === 'surface' ? 'bg-surface-alt' : 'bg-surface dark:bg-surface-alt';

  return (
    <View
      className={cn(
        'h-12 max-w-12 flex-1 items-center justify-center rounded-md border-2',
        // An empty box is a filled well; a typed one is an outline round its digit.
        digit ? 'border-foreground bg-transparent' : cn('border-transparent', fill),
        active && !digit && 'border-muted',
        error && 'border-danger'
      )}>
      {digit ? (
        <Text variant="code" className="text-center">
          {digit}
        </Text>
      ) : active ? (
        <View className="h-6 w-0.5 rounded-full bg-foreground" />
      ) : null}
    </View>
  );
}

/**
 * Shakes the row once each time an error arrives, unless
 * the phone asks for reduced motion. The message under the row says the same
 * thing for everybody.
 */
function useShake(error: string | undefined) {
  const [offset] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!error) return;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return;
      const step = (toValue: number) =>
        Animated.timing(offset, {
          toValue,
          duration: 50,
          useNativeDriver: Platform.OS !== 'web',
        });
      Animated.sequence([step(8), step(-8), step(6), step(-6), step(0)]).start();
    });
    return () => {
      cancelled = true;
    };
  }, [error, offset]);

  return offset;
}
