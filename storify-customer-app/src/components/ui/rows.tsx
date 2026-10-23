import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Pressable, View, type PressableProps, type ViewProps } from 'react-native';

import { cn } from '@/lib/cn';

import { Icon, type IconName } from './icon';
import { Switch } from './switch';
import { Text } from './text';

/**
 * The rows of lists and settings: a row to open something, a radio row, a check row and a
 * switch row. Rows are stacked in a `RowGroup`, which draws the lines between
 * them.
 */

type RowGroupProps = ViewProps & {
  /**
   * On a `surface` card with round corners, as on Security and Preferences (the
   * default); `false` for rows straight on a sheet or the page, as in Sort.
   */
  card?: boolean;
  className?: string;
};

/**
 * Rows, one under the other, with a line between each two. A list of radio
 * rows passes `accessibilityRole="radiogroup"`.
 */
export function RowGroup({ card = true, className, children, ...props }: RowGroupProps) {
  const rows = Children.toArray(children).filter(isValidElement);

  return (
    <View className={cn(card && 'rounded-xl bg-surface px-5 py-1', className)} {...props}>
      {rows.map((row, index) => (
        <Fragment key={row.key ?? index}>
          {index > 0 ? <View className="h-px bg-border" /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

// Every row: at least 52 pt, the text at the start and the control at the end.
const ROW = 'min-h-[52px] flex-row items-center gap-3 py-3.5';

type RowText = {
  title: string;
  /** A line under the title, in `muted`: "Reset password". */
  description?: string;
};

function RowLabel({ title, description }: RowText) {
  return (
    <View className="flex-1 gap-1">
      <Text variant="subheading">{title}</Text>
      {description ? (
        <Text variant="body" className="text-muted">
          {description}
        </Text>
      ) : null}
    </View>
  );
}

type NavRowProps = Omit<PressableProps, 'children'> &
  RowText & {
    icon?: IconName;
    /**
     * What is set now, before the chevron: "Trending". A string is drawn in
     * `muted`; a drawing (stars and a count) is drawn as given, and then
     * `valueLabel` says it for screen readers.
     */
    value?: ReactNode;
    valueLabel?: string;
    className?: string;
  };

/** A row that opens a screen or a sheet: an icon, the title, a value, and a chevron that turns round right to left. */
export function NavRow({
  title,
  description,
  icon,
  value,
  valueLabel,
  disabled,
  className,
  ...props
}: NavRowProps) {
  const spoken = valueLabel ?? (typeof value === 'string' ? value : undefined);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, spoken].filter(Boolean).join(', ')}
      accessibilityHint={description}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      className={cn(ROW, 'active:opacity-70', disabled && 'opacity-50', className)}
      {...props}>
      {icon ? <Icon name={icon} size={22} /> : null}
      <RowLabel title={title} description={description} />
      {typeof value === 'string' ? (
        <Text numberOfLines={1} className="max-w-[45%] text-muted">
          {value}
        </Text>
      ) : (
        value
      )}
      <Icon name="chevron-right" size={20} directional />
    </Pressable>
  );
}

/** The radio of a radio row: a ring, and when chosen an `accent` disc with a white dot. */
export function Radio({ selected }: { selected: boolean }) {
  return selected ? (
    <View className="size-[22px] items-center justify-center rounded-full bg-accent">
      <View className="size-2 rounded-full bg-accent-foreground" />
    </View>
  ) : (
    <View className="size-[22px] rounded-full border-[1.5px] border-muted" />
  );
}

type RadioRowProps = Omit<PressableProps, 'children' | 'onPress'> &
  RowText & {
    selected: boolean;
    onSelect: () => void;
    className?: string;
  };

/** One choice among several: Sort's "Newest", an address. */
export function RadioRow({
  title,
  description,
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
      className={cn(ROW, 'active:opacity-70', disabled && 'opacity-50', className)}
      {...props}>
      <RowLabel title={title} description={description} />
      <Radio selected={selected} />
    </Pressable>
  );
}

/** The box of a check row: 20 pt, and when checked a `primary` fill with a white tick. */
function Checkbox({ checked }: { checked: boolean }) {
  return (
    <View
      className={cn(
        'size-5 items-center justify-center rounded-sm border-[1.5px]',
        checked ? 'border-primary bg-primary' : 'border-muted'
      )}>
      {checked ? (
        <Icon name="check" size={14} strokeWidth={3} colorClassName="accent-primary-foreground" />
      ) : null}
    </View>
  );
}

type CheckRowProps = Omit<PressableProps, 'children' | 'onPress'> &
  RowText & {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    /**
     * A colour swatch before the title, in the colour the store sends for it
     * (a swatch is content, not a theme colour). The title names the colour,
     * for those who cannot see it.
     */
    swatch?: string;
    className?: string;
  };

/** One of several things that can be ticked together: the colours in Filter. */
export function CheckRow({
  title,
  description,
  checked,
  onCheckedChange,
  swatch,
  disabled,
  className,
  ...props
}: CheckRowProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={title}
      accessibilityHint={description}
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={() => onCheckedChange(!checked)}
      className={cn(ROW, 'active:opacity-70', disabled && 'opacity-50', className)}
      {...props}>
      {swatch ? (
        // A ring in `border` so that a white or a black swatch shows on any surface.
        <View
          style={{ backgroundColor: swatch }}
          className="size-6 rounded-full border border-border"
        />
      ) : null}
      <RowLabel title={title} description={description} />
      <Checkbox checked={checked} />
    </Pressable>
  );
}

type SwitchRowProps = RowText & {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
};

/**
 * A setting that is on or off: the title and what it does at the start, the
 * switch at the end, level with the title. The whole row flips it; screen
 * readers find one element, the switch, named by the title.
 */
export function SwitchRow({
  title,
  description,
  value,
  onValueChange,
  disabled = false,
  className,
}: SwitchRowProps) {
  return (
    <Pressable
      accessible={false}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      className={cn('flex-row items-start gap-4 py-4', disabled && 'opacity-50', className)}>
      <RowLabel title={title} description={description} />
      <Switch
        accessibilityLabel={title}
        accessibilityHint={description}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
      />
    </Pressable>
  );
}
