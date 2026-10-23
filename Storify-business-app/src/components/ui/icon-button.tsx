import { cn } from '@/lib/cn';

import { CountBadge } from './badge';
import { Icon, type IconName, type IconTint } from './icon';
import { PressableScale, ROUND_PRESS_SCALE, type PressableScaleProps } from './press-motion';

/**
 * The app's round buttons.
 *
 * - `floating`: a 40 pt `surface` circle with a soft shadow: back, close, a
 *   header's actions.
 * - `plain`: the icon alone, in a 44 pt touch area: an action inside a row or
 *   a field.
 * - `onBrand`: a 40 pt circle of the store's colour's foreground, faint, with
 *   the icon in it: a header drawn on `primary` (the Account tab).
 */
const VARIANTS = {
  floating: { box: 'size-10 bg-surface shadow-button dark:border dark:border-border', hitSlop: 2 },
  plain: { box: 'size-11', hitSlop: 0 },
  onBrand: {
    box: 'size-10 bg-primary-foreground/15',
    hitSlop: 2,
    tint: 'accent-primary-foreground',
  },
} as const satisfies Record<string, { box: string; hitSlop: number; tint?: IconTint }>;

type IconButtonVariant = keyof typeof VARIANTS;

export type IconButtonProps = Omit<PressableScaleProps, 'children' | 'scaleTo'> & {
  icon: IconName;
  /** What a screen reader says: "Back", "Scan a barcode". There is no text to fall back on. */
  label: string;
  variant?: IconButtonVariant;
  /** A count on the button's corner. Nothing shows at zero. */
  count?: number;
  /** Turn the icon around in a right-to-left layout: arrows. */
  directional?: boolean;
  className?: string;
};

export function IconButton({
  icon,
  label,
  variant = 'floating',
  count = 0,
  directional,
  disabled,
  className,
  ...props
}: IconButtonProps) {
  const styles = VARIANTS[variant];

  return (
    <PressableScale
      scaleTo={ROUND_PRESS_SCALE}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={styles.hitSlop}
      className={cn(
        'items-center justify-center rounded-full active:opacity-90',
        styles.box,
        disabled && 'opacity-40 shadow-none',
        className
      )}
      {...props}>
      <Icon
        name={icon}
        size={20}
        directional={directional}
        colorClassName={'tint' in styles ? styles.tint : undefined}
      />
      <CountBadge count={count} className="absolute -end-1 -top-1" />
    </PressableScale>
  );
}
