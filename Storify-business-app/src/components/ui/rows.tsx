import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Platform, Pressable, View, type PressableProps, type ViewProps } from 'react-native';

import { cn } from '@/lib/cn';

import { Icon, type IconName } from './icon';
import { Text } from './text';

/**
 * The rows of lists, settings and details, and the group that holds them: a
 * `surface` card with a line between each two rows. A row is one touch target
 * and one element for a screen reader.
 */

type RowGroupProps = ViewProps & {
  /**
   * Where the line between two rows starts: under the text (`text`, the
   * default) or past a leading thumbnail or avatar (`leading`).
   */
  divider?: 'text' | 'leading';
  /**
   * No card: rows straight on a sheet's panel, which is `surface` already. The
   * rows lose their own side padding, and the lines run the full width.
   */
  bare?: boolean;
  /**
   * A title inside the card, above its rows, as the shopper app's settings
   * cards ("Email Notifications", "Security"): `heading`, with the card's
   * padding around it.
   */
  title?: string;
  className?: string;
};

/** Rows, one under the other, on a `surface` card, with a line between each two. */
export function RowGroup({
  divider = 'text',
  bare = false,
  title,
  className,
  children,
  ...props
}: RowGroupProps) {
  const rows = Children.toArray(children).filter(isValidElement);

  return (
    <View
      className={cn(!bare && 'overflow-hidden rounded-xl bg-surface', title && 'pb-1', className)}
      {...props}>
      {title ? (
        <Text variant="heading" accessibilityRole="header" className="px-4 pb-1 pt-5">
          {title}
        </Text>
      ) : null}
      {rows.map((row, index) => (
        <Fragment key={row.key ?? index}>
          {index > 0 ? (
            <View
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
              className={cn(
                'h-px bg-border',
                bare ? null : divider === 'leading' ? 'ms-[72px]' : 'ms-4'
              )}
            />
          ) : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

/** The label above a group: "Security", "Preferences". */
export function SectionLabel({ title, className }: { title: string; className?: string }) {
  return (
    <Text variant="section" accessibilityRole="header" className={cn('px-4 pb-2', className)}>
      {title}
    </Text>
  );
}

/** A footnote under a group: what the rows leave to the website. */
export function GroupFootnote({ text, className }: { text: string; className?: string }) {
  return (
    <Text variant="caption" className={cn('px-4 pt-2', className)}>
      {text}
    </Text>
  );
}

// A row's pressed state is a quiet fill, the whole width of its card.
const PRESSED = 'active:bg-surface-alt';
// A value ends at the end edge in either direction: on a phone `text-right` is
// "end" once the layout is right-to-left (see text.tsx); a browser needs `text-end`.
const END = Platform.OS === 'web' ? 'text-end' : 'text-right';

type ListRowProps = Omit<PressableProps, 'children'> & {
  /** A thumbnail (`AppImage`, 44 pt), an `Avatar` or an `IconCircle`. */
  leading?: ReactNode;
  /** The first line, in `label`: an order's number, a product's name. One line. */
  title: string;
  /** At the end of the first line: a total (`Price`), a time. */
  titleEnd?: ReactNode;
  /** The second line, in `body`: the customer's name. */
  subtitle?: string;
  /** The last line, in `meta`: "5 Oct · 3 items". A drawing in place of text is drawn as given. */
  meta?: ReactNode;
  /** At the end of the last line: the status chips. */
  metaEnd?: ReactNode;
  /** A chevron at the end, for a row that opens a screen. */
  chevron?: boolean;
  /** The first line bold and a little darker: an unread conversation. */
  emphasis?: boolean;
  /** What a screen reader says for the whole row; it is one element. */
  accessibilityLabel: string;
  className?: string;
};

/**
 * A row of a long list: an order, a product, a conversation, a payout. Up to
 * three lines, with something at the end of the first and of the last, and
 * an optional thumbnail at the start. 56 pt with one line, about 72 with three.
 */
export function ListRow({
  leading,
  title,
  titleEnd,
  subtitle,
  meta,
  metaEnd,
  chevron = false,
  emphasis = false,
  disabled,
  className,
  ...props
}: ListRowProps) {
  return (
    <Pressable
      accessibilityRole={props.onPress ? 'button' : undefined}
      accessible
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      className={cn(
        'min-h-14 flex-row items-center gap-3 px-4 py-3',
        props.onPress && PRESSED,
        disabled && 'opacity-50',
        className
      )}
      {...props}>
      {leading}
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-3">
          <Text variant="label" numberOfLines={1} className={cn('flex-1', emphasis && 'font-bold')}>
            {title}
          </Text>
          {titleEnd}
        </View>
        {subtitle ? <Text numberOfLines={1}>{subtitle}</Text> : null}
        {meta || metaEnd ? (
          <View className="flex-row items-center gap-3">
            <View className="flex-1">
              {typeof meta === 'string' ? (
                <Text variant="meta" numberOfLines={1}>
                  {meta}
                </Text>
              ) : (
                meta
              )}
            </View>
            {metaEnd ? <View className="flex-row items-center gap-1.5">{metaEnd}</View> : null}
          </View>
        ) : null}
      </View>
      {chevron ? (
        <Icon name="chevron-right" size={18} colorClassName="accent-muted" directional />
      ) : null}
    </Pressable>
  );
}

type NavRowProps = Omit<PressableProps, 'children'> & {
  title: string;
  /** A line under the title, in `meta`. */
  description?: string;
  /** An icon at the start, or a drawing (an `IconCircle`, an `Avatar`). */
  icon?: IconName;
  leading?: ReactNode;
  /** What is set now, before the chevron: "On", "English". */
  value?: string;
  /** Drawn before the value: a count badge. */
  trailing?: ReactNode;
  /** No chevron: a row that opens a sheet in place says so with its value alone. */
  chevron?: boolean;
  className?: string;
};

/** A row that opens a screen or a sheet: an icon, the title, a value, and a chevron that turns round right to left. */
export function NavRow({
  title,
  description,
  icon,
  leading,
  value,
  trailing,
  chevron = true,
  disabled,
  className,
  ...props
}: NavRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, value].filter(Boolean).join(', ')}
      accessibilityHint={description}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      className={cn(
        'min-h-[52px] flex-row items-center gap-3 px-4 py-3',
        PRESSED,
        disabled && 'opacity-50',
        className
      )}
      {...props}>
      {leading ?? (icon ? <Icon name={icon} size={22} /> : null)}
      <View className="flex-1 gap-0.5">
        <Text variant="subheading">{title}</Text>
        {description ? <Text variant="meta">{description}</Text> : null}
      </View>
      {trailing}
      {value ? (
        <Text numberOfLines={1} className="max-w-[45%] text-muted">
          {value}
        </Text>
      ) : null}
      {chevron ? (
        <Icon name="chevron-right" size={18} colorClassName="accent-muted" directional />
      ) : null}
    </Pressable>
  );
}

type ValueRowProps = {
  /** What the value is: "Payment", "Placed". */
  label: string;
  /** The value as text, or a drawing (a status chip) with `valueLabel` for screen readers. */
  value: ReactNode;
  valueLabel?: string;
  className?: string;
};

/**
 * A fact: the label at the start in `muted`, the value at the end. A long
 * value wraps under the label instead of squeezing it.
 */
export function ValueRow({ label, value, valueLabel, className }: ValueRowProps) {
  const spoken = valueLabel ?? (typeof value === 'string' ? value : undefined);

  return (
    <View
      accessible
      accessibilityLabel={[label, spoken].filter(Boolean).join(', ')}
      className={cn(
        'min-h-11 flex-row flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3',
        className
      )}>
      <Text className="text-muted">{label}</Text>
      <View className="ms-auto max-w-full shrink items-end">
        {typeof value === 'string' ? <Text className={END}>{value}</Text> : value}
      </View>
    </View>
  );
}

/** The radio of a radio row: a ring, and when chosen an `accent` disc with a dot. */
export function Radio({ selected }: { selected: boolean }) {
  return selected ? (
    <View className="size-[22px] items-center justify-center rounded-full bg-accent">
      <View className="size-2 rounded-full bg-accent-foreground" />
    </View>
  ) : (
    <View className="size-[22px] rounded-full border-[1.5px] border-muted" />
  );
}

type RadioRowProps = Omit<PressableProps, 'children' | 'onPress'> & {
  title: string;
  description?: string;
  /** Drawn at the start: a logo tile, an icon. */
  leading?: ReactNode;
  selected: boolean;
  onSelect: () => void;
  className?: string;
};

/** One choice among several: a language, a reason, a workspace. */
export function RadioRow({
  title,
  description,
  leading,
  selected,
  onSelect,
  disabled,
  className,
  ...props
}: RadioRowProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={title}
      accessibilityHint={description}
      accessibilityState={{ checked: selected, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onSelect}
      className={cn(
        'min-h-[52px] flex-row items-center gap-3 px-4 py-3',
        PRESSED,
        disabled && 'opacity-50',
        className
      )}
      {...props}>
      {leading}
      <View className="flex-1 gap-0.5">
        <Text variant="subheading">{title}</Text>
        {description ? <Text variant="meta">{description}</Text> : null}
      </View>
      <Radio selected={selected} />
    </Pressable>
  );
}

type ActionRowProps = Omit<PressableProps, 'children'> & {
  title: string;
  icon?: IconName;
  /** In `danger`: "Sign out". Otherwise in `link`. */
  destructive?: boolean;
  className?: string;
};

/** A row that does something at once: "Sign out", "Follow the parcel". */
export function ActionRow({
  title,
  icon,
  destructive = false,
  disabled,
  className,
  ...props
}: ActionRowProps) {
  const tint = destructive ? 'accent-danger' : 'accent-link';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      className={cn(
        'min-h-[52px] flex-row items-center gap-3 px-4 py-3',
        PRESSED,
        disabled && 'opacity-50',
        className
      )}
      {...props}>
      {icon ? <Icon name={icon} size={22} colorClassName={tint} /> : null}
      <Text
        variant="subheading"
        className={cn('flex-1', destructive ? 'text-danger' : 'text-link')}>
        {title}
      </Text>
    </Pressable>
  );
}
