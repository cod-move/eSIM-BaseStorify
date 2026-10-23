import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, View, type PressableProps } from 'react-native';

import { cn } from '@/lib/cn';

import { Icon, type IconName, type IconTint } from './icon';
import { PressableScale, type PressableScaleProps } from './press-motion';
import { Text } from './text';

/**
 * The app's buttons. Every button is a full pill.
 *
 * - `primary`: most actions (Apply, Add to cart, Proceed to Checkout).
 * - `accent`: the step that commits (Pay, Buy Now, Sign in, Save).
 * - `secondary`: the second choice beside a main one (Reset, Cancel, Remove).
 * - `strong`: a dark slate button beside a coloured one (Add to Cart beside Buy Now).
 * - `outline`: a small action on a card (Change location, Add).
 * - `ghost`: a quiet pill (Add address details, Notes).
 * - `social`: "Continue with Google", outlined, with the network's mark at the start.
 * - `danger`: the one destructive action of a screen (Delete account). It is
 *   outlined in `danger`: that token is dark enough to be text in both
 *   themes, where white on a `danger` fill is not in dark mode.
 *
 * `rule` is the thin line between the label and a trailing amount.
 */
const VARIANTS = {
  primary: {
    box: 'bg-primary',
    label: 'text-primary-foreground',
    tint: 'accent-primary-foreground',
    rule: 'bg-primary-foreground',
  },
  accent: {
    box: 'bg-accent',
    label: 'text-accent-foreground',
    tint: 'accent-accent-foreground',
    rule: 'bg-accent-foreground',
  },
  secondary: {
    box: 'bg-secondary',
    label: 'text-secondary-foreground',
    tint: 'accent-secondary-foreground',
    rule: 'bg-secondary-foreground',
  },
  strong: {
    box: 'bg-neutral-strong',
    label: 'text-neutral-strong-foreground',
    tint: 'accent-neutral-strong-foreground',
    rule: 'bg-neutral-strong-foreground',
  },
  outline: {
    box: 'border-[1.5px] border-accent bg-transparent',
    label: 'text-accent',
    tint: 'accent-accent',
    rule: 'bg-accent',
  },
  ghost: {
    box: 'border border-border bg-transparent',
    label: 'text-muted',
    tint: 'accent-muted',
    rule: 'bg-border',
  },
  social: {
    box: 'border-[1.5px] border-foreground bg-transparent',
    label: 'text-foreground',
    tint: 'accent-foreground',
    rule: 'bg-foreground',
  },
  danger: {
    box: 'border-[1.5px] border-danger bg-transparent',
    label: 'text-danger',
    tint: 'accent-danger',
    rule: 'bg-danger',
  },
} as const satisfies Record<string, { box: string; label: string; tint: IconTint; rule: string }>;

// `md` is the design's 48 pt pill. `sm` is 32 pt; the touch area reaches 44 pt
// through `hitSlop`, so the small pill still meets the platforms' minimum.
const SIZES = {
  md: { box: 'min-h-12 px-6 py-3', label: 'label', icon: 20, hitSlop: undefined },
  sm: { box: 'min-h-8 px-4 py-1.5', label: 'chip', icon: 16, hitSlop: 6 },
} as const;

type ButtonVariant = keyof typeof VARIANTS;
type ButtonSize = keyof typeof SIZES;

export type ButtonProps = Omit<PressableScaleProps, 'children' | 'scaleTo'> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** An icon before the label. */
  icon?: IconName;
  /** Something drawn at the start instead of an icon: a social network's mark. */
  leading?: ReactNode;
  /**
   * Text at the end, split from the label by a thin line: the amount on a pay
   * button. It is printed as given, so a price must arrive formatted.
   */
  trailing?: string;
  /**
   * Shows a spinner in place of the label and ignores presses. The label stays,
   * unseen, so the button keeps its width and a screen reader still names it.
   */
  loading?: boolean;
  className?: string;
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  icon,
  leading,
  trailing,
  loading = false,
  disabled,
  className,
  ...props
}: ButtonProps) {
  const styles = VARIANTS[variant];
  const dimensions = SIZES[size];
  const inactive = Boolean(disabled) || loading;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={trailing ? `${label}, ${trailing}` : label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      hitSlop={dimensions.hitSlop}
      className={cn(
        'flex-row items-center justify-center gap-2 rounded-full active:opacity-90',
        dimensions.box,
        styles.box,
        disabled && 'opacity-40',
        className
      )}
      {...props}>
      {leading ? (
        <View className={cn('absolute start-4', loading && 'opacity-0')}>{leading}</View>
      ) : null}
      {/* While busy the content is kept but not shown, so the pill does not change size. */}
      <View
        className={cn(
          'shrink flex-row items-center gap-2',
          trailing && 'flex-1',
          loading && 'opacity-0'
        )}>
        {icon ? <Icon name={icon} size={dimensions.icon} colorClassName={styles.tint} /> : null}
        <Text
          variant={dimensions.label}
          className={cn(styles.label, trailing ? 'flex-1' : 'shrink text-center')}
          numberOfLines={1}>
          {label}
        </Text>
        {trailing ? (
          <View className="flex-row items-center gap-4">
            <View className={cn('h-6 w-px opacity-60', styles.rule)} />
            <Text variant="subheading" className={styles.label} numberOfLines={1}>
              {trailing}
            </Text>
          </View>
        ) : null}
      </View>
      {loading ? (
        <View className="absolute inset-0 items-center justify-center">
          <ActivityIndicator colorClassName={styles.tint} />
        </View>
      ) : null}
    </PressableScale>
  );
}

type TextLinkProps = Omit<PressableProps, 'children'> & {
  label: string;
  /** Underlined when it stands alone, as "View E-Receipt" does; not inside a sentence or a header. */
  underline?: boolean;
  /** `foreground` for a quiet link ("Send a new code"); `link` by default. */
  tone?: 'link' | 'foreground';
  className?: string;
};

/** A link drawn as text: "View All", "Forgot Password?". */
export function TextLink({
  label,
  underline = false,
  tone = 'link',
  disabled,
  className,
  ...props
}: TextLinkProps) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={12}
      className={cn('active:opacity-70', disabled && 'opacity-40', className)}
      {...props}>
      <Text
        variant="label"
        className={cn(tone === 'link' ? 'text-link' : 'text-foreground', underline && 'underline')}>
        {label}
      </Text>
    </Pressable>
  );
}
