import { Pressable, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { cn } from '@/lib/cn';

import { Icon, type IconName } from './icon';
import { Text } from './text';

const VARIANTS = {
  /** A cart line: an outlined box of three 36 pt cells. */
  line: { box: 'h-9 border border-border', cell: 'h-9 w-9' },
  /** The product page: filled with `background`, a little larger. */
  product: { box: 'h-[42px] border border-border bg-background', cell: 'h-[42px] w-10' },
} as const;

type StepperProps = {
  value: number;
  /** Asks for a new quantity. The store answers with the one that holds. */
  onChange: (quantity: number) => void;
  /** The least the store takes: minus stops here. */
  min?: number;
  /** The most the store allows (`maxQuantity`): plus stops here. */
  max: number;
  /**
   * At the least quantity, minus becomes a bin that asks to remove the line
   * (the cart). Without it, minus stops there (the product page).
   */
  removable?: boolean;
  onRemove?: () => void;
  /** A change is on its way to the store: the whole stepper waits for the answer. */
  busy?: boolean;
  disabled?: boolean;
  variant?: keyof typeof VARIANTS;
  className?: string;
};

/**
 * The quantity stepper: minus, the count, plus.
 * It asks for a quantity and shows the one it is given; it never
 * shows a quantity the store has not answered with.
 */
export function Stepper({
  value,
  onChange,
  min = 1,
  max,
  removable = false,
  onRemove,
  busy = false,
  disabled = false,
  variant = 'line',
  className,
}: StepperProps) {
  const t = useTranslations('fields');
  const format = useFormatter();
  const styles = VARIANTS[variant];
  const waiting = disabled || busy;
  const atMin = value <= min;
  const quantity = format.number(value);
  const cell = { className: styles.cell, waiting, busy };

  return (
    <View
      className={cn(
        'flex-row items-center self-start rounded-md',
        styles.box,
        waiting && 'opacity-50',
        className
      )}>
      {removable && atMin ? (
        <StepButton
          {...cell}
          icon="trash"
          label={t('remove')}
          atLimit={!onRemove}
          onPress={() => onRemove?.()}
        />
      ) : (
        <StepButton
          {...cell}
          icon="minus"
          label={t('decrease')}
          atLimit={atMin}
          onPress={() => onChange(value - 1)}
        />
      )}
      <Text
        variant="label"
        accessibilityLabel={t('quantity', { quantity })}
        accessibilityLiveRegion="polite"
        className="min-w-6 text-center">
        {quantity}
      </Text>
      <StepButton
        {...cell}
        icon="plus"
        label={t('increase')}
        atLimit={value >= max}
        onPress={() => onChange(value + 1)}
      />
    </View>
  );
}

type StepButtonProps = {
  icon: IconName;
  label: string;
  /** This way is closed: the store's least or most. */
  atLimit: boolean;
  /** The whole stepper is off; it is dimmed as one, not button by button. */
  waiting: boolean;
  busy: boolean;
  onPress: () => void;
  className: string;
};

function StepButton({ icon, label, atLimit, waiting, busy, onPress, className }: StepButtonProps) {
  const disabled = waiting || atLimit;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      // The cells are 36 pt; this makes each a 44 pt target.
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      className={cn('items-center justify-center active:opacity-60', className)}>
      <View className={cn(atLimit && !waiting && 'opacity-30')}>
        <Icon name={icon} size={16} strokeWidth={2.5} />
      </View>
    </Pressable>
  );
}
