import { useTranslations } from 'use-intl';

import { cn } from '@/lib/cn';

import { CountBadge } from './badge';
import { Icon, type IconName } from './icon';
import { PressableScale, ROUND_PRESS_SCALE, type PressableScaleProps } from './press-motion';

/**
 * The app's round buttons.
 *
 * - `floating`: a 33 pt `surface` circle with a soft shadow, on a picture or a
 *   header (back, close, share).
 * - `outlined`: a 37 pt circle with a 1 pt `border` (the product page's heart).
 * - `solid`: a 25 pt `primary` circle (the cart button on a product card).
 *
 * Each is drawn small and reaches the platforms' 44 pt through `hitSlop`.
 */
const VARIANTS = {
  floating: {
    box: 'size-[33px] bg-surface shadow-button',
    tint: 'accent-foreground',
    icon: 18,
    hitSlop: 6,
  },
  outlined: {
    box: 'size-[37px] border border-border bg-surface',
    tint: 'accent-foreground',
    icon: 20,
    hitSlop: 4,
  },
  solid: {
    box: 'size-[25px] bg-primary',
    tint: 'accent-primary-foreground',
    icon: 14,
    hitSlop: 10,
  },
} as const;

type IconButtonVariant = keyof typeof VARIANTS;

export type IconButtonProps = Omit<PressableScaleProps, 'children' | 'scaleTo'> & {
  icon: IconName;
  /** What a screen reader says: "Back", "Add to wishlist". There is no text to fall back on. */
  label: string;
  variant?: IconButtonVariant;
  /** The button is on: a chosen heart is drawn filled, in the `sale` colour. */
  selected?: boolean;
  /** A count on the button's corner (the cart's lines). Nothing shows at zero. */
  count?: number;
  /** Turn the icon around in a right-to-left layout: arrows. */
  directional?: boolean;
  className?: string;
};

export function IconButton({
  icon,
  label,
  variant = 'floating',
  selected,
  count = 0,
  directional,
  disabled,
  className,
  ...props
}: IconButtonProps) {
  const t = useTranslations('catalog');
  const styles = VARIANTS[variant];

  return (
    <PressableScale
      scaleTo={ROUND_PRESS_SCALE}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? t('labelWithCount', { label, count }) : label}
      accessibilityState={{ disabled: Boolean(disabled), selected }}
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
        size={styles.icon}
        colorClassName={selected ? 'accent-sale' : styles.tint}
        filled={selected}
        directional={directional}
      />
      <CountBadge count={count} className="absolute -end-1.5 -top-1.5" />
    </PressableScale>
  );
}
