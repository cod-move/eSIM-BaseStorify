import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { cn } from '@/lib/cn';

import { IconButton } from './icon-button';
import { useFieldSurface } from './text-field';

type QuantityStepperProps = {
  value: number;
  onChange: (value: number) => void;
  /** What a screen reader calls the number: "Quantity for item 1". */
  label: string;
  decreaseLabel: string;
  increaseLabel: string;
  min?: number;
  max: number;
  disabled?: boolean;
};

/**
 * A quantity in a line: minus, the number (typed when the steps are too
 * slow), plus. A typed number that is not a whole number within the range is
 * passed on as `NaN`, so the form refuses it rather than guessing.
 */
export function QuantityStepper({
  value,
  onChange,
  label,
  decreaseLabel,
  increaseLabel,
  min = 1,
  max,
  disabled = false,
}: QuantityStepperProps) {
  const surface = useFieldSurface();
  const [text, setText] = useState(Number.isNaN(value) ? '' : String(value));
  // A step or a change from elsewhere replaces what is typed; a typed number stays as typed.
  const [shown, setShown] = useState(value);
  if (!Object.is(shown, value)) {
    setShown(value);
    if (!Number.isNaN(value) && Number(text) !== value) setText(String(value));
  }
  const valid = Number.isInteger(value) && value >= min && value <= max;
  return (
    <View
      className={cn(
        'h-10 flex-row items-center rounded-full',
        surface === 'surface' ? 'bg-surface-alt' : 'bg-surface dark:bg-surface-alt',
        !valid && 'border-[1.5px] border-danger',
        disabled && 'opacity-50'
      )}>
      <IconButton
        icon="minus"
        variant="plain"
        label={decreaseLabel}
        className="size-10"
        disabled={disabled || !valid || value <= min}
        onPress={() => onChange(value - 1)}
      />
      <TextInput
        accessibilityLabel={label}
        value={text}
        editable={!disabled}
        keyboardType="number-pad"
        inputMode="numeric"
        selectTextOnFocus
        maxLength={String(max).length}
        className="w-12 text-center text-[15px] font-semibold tabular-nums text-foreground"
        onChangeText={(next) => {
          setText(next);
          const number = /^\d+$/.test(next.trim()) ? Number(next) : Number.NaN;
          onChange(number >= min && number <= max ? number : Number.NaN);
        }}
      />
      <IconButton
        icon="plus"
        variant="plain"
        label={increaseLabel}
        className="size-10"
        disabled={disabled || (valid && value >= max)}
        onPress={() => onChange(valid ? value + 1 : min)}
      />
    </View>
  );
}
