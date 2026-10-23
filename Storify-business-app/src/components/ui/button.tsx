import { ActivityIndicator, Pressable, View, type PressableProps } from 'react-native';

import { cn } from '@/lib/cn';

import { Icon, type IconName, type IconTint } from './icon';
import { PressableScale, type PressableScaleProps } from './press-motion';
import { Text } from './text';

/**
 * The app's buttons. Every button is a full pill.
 *
 * - `primary`: the usual main step.
 * - `accent`: the step that commits: Sign in, Verify, Save, Mark shipped,
 *   Confirm.
 * - `secondary`: the other choice beside a main one: Keep order, Cancel.
 * - `ink`: `foreground` on `background`, whatever the store's brand: a
 *   tab's own "Add product", "Create order" in its header.
 * - `danger`: the confirmed destructive step, inside a confirm sheet only. Its
 *   label is `danger-foreground`, which reads on the `danger` fill in both
 *   themes.
 * - `ghost`: no fill, the label in `link` (or `danger` with `tone`): "Use a
 *   backup code", "Not now".
 */
const VARIANTS = {
  primary: {
    box: 'bg-primary',
    label: 'text-primary-foreground',
    tint: 'accent-primary-foreground',
  },
  accent: { box: 'bg-accent', label: 'text-accent-foreground', tint: 'accent-accent-foreground' },
  secondary: {
    box: 'bg-secondary',
    label: 'text-secondary-foreground',
    tint: 'accent-secondary-foreground',
  },
  ink: { box: 'bg-foreground', label: 'text-background', tint: 'accent-background' },
  danger: { box: 'bg-danger', label: 'text-danger-foreground', tint: 'accent-danger-foreground' },
  ghost: { box: 'bg-transparent', label: 'text-link', tint: 'accent-link' },
} as const satisfies Record<string, { box: string; label: string; tint: IconTint }>;

// `md` is the house's 48 pt pill. `sm` is 36 pt, for a card or a row; its touch
// area reaches 44 pt through `hitSlop`.
const SIZES = {
  md: { box: 'min-h-12 px-6 py-3', icon: 20, hitSlop: undefined },
  sm: { box: 'min-h-9 px-4 py-2', icon: 18, hitSlop: 4 },
} as const;

type ButtonVariant = keyof typeof VARIANTS;
type ButtonSize = keyof typeof SIZES;

export type ButtonProps = Omit<PressableScaleProps, 'children' | 'scaleTo'> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** An icon before the label. */
  icon?: IconName;
  /** A ghost button's label in `danger`: "Cancel order", "Sign out". */
  destructive?: boolean;
  /** Stretches across the space it is in. */
  block?: boolean;
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
  destructive = false,
  block = false,
  loading = false,
  disabled,
  className,
  ...props
}: ButtonProps) {
  const styles = VARIANTS[variant];
  const dimensions = SIZES[size];
  const inactive = Boolean(disabled) || loading;
  const red = destructive && variant === 'ghost';
  const labelClass = red ? 'text-danger' : styles.label;
  const tint: IconTint = red ? 'accent-danger' : styles.tint;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      hitSlop={dimensions.hitSlop}
      className={cn(
        'flex-row items-center justify-center gap-2 rounded-full active:opacity-90',
        dimensions.box,
        styles.box,
        block && 'self-stretch',
        disabled && 'opacity-40',
        className
      )}
      {...props}>
      {/* While busy the content is kept but not shown, so the pill does not change size. */}
      <View className={cn('shrink flex-row items-center gap-2', loading && 'opacity-0')}>
        {icon ? <Icon name={icon} size={dimensions.icon} colorClassName={tint} /> : null}
        <Text variant="label" className={cn('shrink text-center', labelClass)} numberOfLines={2}>
          {label}
        </Text>
      </View>
      {loading ? (
        <View className="absolute inset-0 items-center justify-center">
          <ActivityIndicator colorClassName={tint} />
        </View>
      ) : null}
    </PressableScale>
  );
}

type TextLinkProps = Omit<PressableProps, 'children'> & {
  label: string;
  /** Underlined when it stands alone; not inside a sentence or a header. */
  underline?: boolean;
  /**
   * `foreground` (underlined) on a tinted fill, where `link` would be too
   * faint: a banner's action.
   */
  tone?: 'link' | 'foreground';
  className?: string;
};

/** A link drawn as text: "Reset it on the website", "Try again". */
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
        className={cn(
          tone === 'link' ? 'text-link' : 'text-foreground',
          (underline || tone === 'foreground') && 'underline'
        )}>
        {label}
      </Text>
    </Pressable>
  );
}
