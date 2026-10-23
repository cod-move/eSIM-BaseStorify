import { Children, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  Switch as NativeSwitch,
  View,
  type SwitchProps as NativeSwitchProps,
} from 'react-native';
import { useCSSVariable } from 'uniwind';

import { cn } from '@/lib/cn';

import { Text } from './text';
import { FieldSurfaceProvider, useFieldSurface } from './text-field';

export type SwitchProps = Omit<
  NativeSwitchProps,
  | 'trackColor'
  | 'thumbColor'
  | 'ios_backgroundColor'
  | 'trackColorOnClassName'
  | 'trackColorOffClassName'
  | 'thumbColorClassName'
  | 'ios_backgroundColorClassName'
>;

/**
 * The phone's own switch in the house colours (the shopper app's): an `accent`
 * track when on, `surface-alt` when off, a white knob. The colours are tokens,
 * so they follow the theme and the store's brand.
 *
 * Give it an `accessibilityLabel`; inside a `SwitchRow` the row names it.
 */
export function Switch(props: SwitchProps) {
  // The browser preview draws React Native Web's switch, which takes the knob's
  // colour when on from a prop of its own; without it the knob is teal.
  const [knob] = useCSSVariable(['--color-accent-foreground']);
  const web = Platform.OS === 'web' ? ({ activeThumbColor: String(knob) } as object) : null;

  return (
    <NativeSwitch
      trackColorOnClassName="accent-accent"
      trackColorOffClassName="accent-surface-alt"
      thumbColorClassName="accent-accent-foreground"
      ios_backgroundColorClassName="accent-surface-alt"
      {...web}
      {...props}
    />
  );
}

type SwitchRowProps = {
  title: string;
  /** A line under the title saying what the setting does, in `meta`. */
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
};

/**
 * A setting that is on or off: the title (and what it does) at the start, the
 * switch at the end, level with the title. The whole row flips it and is one
 * element for a screen reader.
 */
export function SwitchRow({
  title,
  description,
  value,
  onChange,
  disabled = false,
  className,
}: SwitchRowProps) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={description}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      className={cn(
        'min-h-[52px] flex-row items-start gap-4 py-3',
        disabled && 'opacity-50',
        className
      )}>
      <View className="flex-1 gap-0.5">
        <Text variant="subheading">{title}</Text>
        {description ? <Text variant="meta">{description}</Text> : null}
      </View>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Switch value={value} disabled={disabled} onValueChange={onChange} />
      </View>
    </Pressable>
  );
}

type SwitchSectionProps = SwitchRowProps & {
  /** What the setting brings with it, shown while it is on: its fields, a second switch. */
  children?: ReactNode;
};

/**
 * A setting that brings fields with it: the switch row and, while it is on,
 * those fields under a line, in one box, so what the switch opened reads as
 * part of it. Standing on the page it is a `surface` card; inside a card (a
 * form section, a sheet) it is a box with a 1 pt `border`, as a fold of rare
 * fields is (`Disclosure`). A switch that brings nothing is a `SwitchRow`.
 */
export function SwitchSection({ children, className, ...row }: SwitchSectionProps) {
  const onCard = useFieldSurface() === 'surface';
  const open = row.value && Children.toArray(children).length > 0;

  return (
    <View
      className={cn(
        'overflow-hidden',
        onCard ? 'rounded-lg border border-border' : 'rounded-xl bg-surface',
        className
      )}>
      <SwitchRow {...row} className="px-4" />
      {open ? (
        // Inside the box, a field steps down to `surface-alt` to show, as on any card.
        <FieldSurfaceProvider value="surface">
          <View className="gap-4 border-t border-border px-4 pt-4 pb-4">{children}</View>
        </FieldSurfaceProvider>
      ) : null}
    </View>
  );
}
