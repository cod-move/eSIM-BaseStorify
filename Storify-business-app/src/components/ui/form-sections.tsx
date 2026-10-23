import { createContext, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { cn } from '@/lib/cn';

import { Icon, type IconName } from './icon';
import { IconCircle } from './icon-circle';
import { Text } from './text';
import { FieldLabel, FieldSurfaceProvider } from './text-field';

/**
 * The parts of a long form drawn as the shopper app's checkout: a card per
 * section with its fields inside, titled groups, fields side by side, folds for
 * rare fields, option chips, choice cards and pills.
 */

/** The section a field sits in, so a field that refuses its input marks its section. */
export const FormSectionContext = createContext('');

// Content that is folded away stays mounted, so typed numbers and their checks
// survive; it is hidden from sight and from screen readers.
function folded(open: boolean) {
  return {
    accessibilityElementsHidden: !open,
    importantForAccessibility: open ? ('auto' as const) : ('no-hide-descendants' as const),
  };
}

function Chevron({ open }: { open: boolean }) {
  return (
    <View className={open ? 'rotate-180' : undefined}>
      <Icon name="chevron-down" size={20} colorClassName="accent-muted" />
    </View>
  );
}

type FormSectionProps = {
  id: string;
  title: string;
  icon: IconName;
  /** What the section holds now, on the line under the title. */
  summary?: string;
  /** Folded or open; a section without `onToggle` is always open. */
  open?: boolean;
  onToggle?: () => void;
  /** At the end of the header of a section that does not fold: "Change", "Edit". */
  action?: ReactNode;
  /** A field inside needs correcting: the mark and the summary turn `danger`. */
  invalid?: boolean;
  children: ReactNode;
};

/**
 * One section of a long form: a `surface` card whose header names it, with the
 * section's fields inside the same card. A section that folds says what it
 * holds while folded, so the whole form reads at a glance; its fields are drawn
 * when it first opens and stay mounted after.
 */
export function FormSection({
  id,
  title,
  icon,
  summary,
  open = true,
  onToggle,
  action,
  invalid = false,
  children,
}: FormSectionProps) {
  // A section's fields are drawn the first time it opens, then kept.
  const [visited, setVisited] = useState(open);
  if (open && !visited) setVisited(true);
  return (
    <View className="overflow-hidden rounded-xl bg-surface">
      {onToggle ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={title}
          accessibilityValue={summary ? { text: summary } : undefined}
          accessibilityState={{ expanded: open }}
          onPress={onToggle}
          className="min-h-16 flex-row items-center gap-3 px-4 py-3 active:bg-surface-alt">
          <SectionTitle icon={icon} title={title} summary={summary} invalid={invalid} />
          <Chevron open={open} />
        </Pressable>
      ) : (
        <View className="min-h-16 flex-row items-center gap-3 px-4 py-3">
          <SectionTitle icon={icon} title={title} summary={summary} invalid={invalid} header />
          {action}
        </View>
      )}
      <View className={open ? 'gap-5 px-4 pb-5 pt-2' : 'hidden'} {...folded(open)}>
        <FieldSurfaceProvider value="surface">
          <FormSectionContext value={id}>{visited ? children : null}</FormSectionContext>
        </FieldSurfaceProvider>
      </View>
    </View>
  );
}

function SectionTitle({
  icon,
  title,
  summary,
  invalid,
  header = false,
}: {
  icon: IconName;
  title: string;
  summary?: string;
  invalid: boolean;
  header?: boolean;
}) {
  return (
    <>
      <IconCircle
        icon={invalid ? 'alert-circle' : icon}
        tone={invalid ? 'danger' : 'neutral'}
        size="md"
      />
      <View className="flex-1 gap-0.5">
        <Text variant="title" accessibilityRole={header ? 'header' : undefined}>
          {title}
        </Text>
        {summary ? (
          <Text variant="meta" numberOfLines={1} className={invalid ? 'text-danger' : undefined}>
            {summary}
          </Text>
        ) : null}
      </View>
    </>
  );
}

/**
 * A titled group inside a section, under a line: "Shipping weight",
 * "Customs". The first group of a section leaves the line out.
 */
export function FormGroup({
  title,
  hint,
  first = false,
  children,
}: {
  title?: string;
  hint?: string;
  first?: boolean;
  children: ReactNode;
}) {
  return (
    <View className={cn('gap-4', !first && 'border-t border-border pt-5')}>
      {title || hint ? (
        <View className="gap-1">
          {title ? (
            <Text variant="section" accessibilityRole="header">
              {title}
            </Text>
          ) : null}
          {hint ? <Text variant="caption">{hint}</Text> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Fields side by side, sharing the width: compare-at and cost, length and width. */
export function FieldRow({ children }: { children: ReactNode }) {
  return (
    <View className="flex-row items-start gap-3">
      {(Array.isArray(children) ? children : [children]).map((child, index) =>
        child ? (
          <View key={index} className="min-w-0 flex-1">
            {child}
          </View>
        ) : null
      )}
    </View>
  );
}

/**
 * Fields an operator seldom needs, behind a row that names them, in one box
 * with a 1 pt `border`: open, the fields sit inside it under a line. It opens
 * by itself when one of them already holds a value.
 */
export function Disclosure({
  label,
  hint,
  defaultOpen = false,
  children,
}: {
  label: string;
  /** What is inside, on the folded row: "Display title, product type, specifications". */
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View className="overflow-hidden rounded-lg border border-border">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        className="min-h-12 flex-row items-center gap-3 px-4 py-3 active:bg-surface-alt">
        <View className="flex-1 gap-0.5">
          <Text variant="label">{label}</Text>
          {hint && !open ? (
            <Text variant="meta" numberOfLines={2}>
              {hint}
            </Text>
          ) : null}
        </View>
        <Chevron open={open} />
      </Pressable>
      <View
        className={open ? 'gap-5 border-t border-border px-4 pt-4 pb-4' : 'hidden'}
        {...folded(open)}>
        <FieldSurfaceProvider value="surface">{children}</FieldSurfaceProvider>
      </View>
    </View>
  );
}

export type Choice<T extends string = string> = {
  value: T;
  label: string;
  /** A second line, on a choice card. */
  description?: string;
};

/**
 * A short single choice drawn whole, as the shopper app's option chips: a unit,
 * a fit. The chosen chip is `primary`. Long lists are an `EditorChoice` sheet.
 */
export function ChoiceChips<T extends string>({
  label,
  value,
  choices,
  onChange,
  disabled = false,
  optional = false,
}: {
  label: string;
  value: T | undefined;
  choices: readonly Choice<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  optional?: boolean;
}) {
  return (
    <View className="gap-2">
      <FieldLabel label={label} optional={optional} />
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        className="flex-row flex-wrap gap-2">
        {choices.map((choice) => {
          const selected = choice.value === value;
          return (
            <Pressable
              key={choice.value}
              accessibilityRole="radio"
              accessibilityLabel={choice.label}
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              hitSlop={6}
              onPress={() => onChange(choice.value)}
              className={cn(
                'min-h-9 justify-center rounded-full px-4 py-2 active:opacity-80',
                selected ? 'bg-primary' : 'bg-surface-alt',
                disabled && 'opacity-50'
              )}>
              <Text variant="chip" className={selected ? 'text-primary-foreground' : undefined}>
                {choice.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * A choice between a few kinds, each with what it means: physical or digital.
 * The chosen card has an `accent` ring and radio, as the shopper's address cards.
 */
export function ChoiceCards<T extends string>({
  label,
  value,
  choices,
  onChange,
  disabled = false,
}: {
  label: string;
  value: T;
  choices: readonly Choice<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <View className="gap-2">
      <FieldLabel label={label} />
      <View accessibilityRole="radiogroup" accessibilityLabel={label} className="gap-2">
        {choices.map((choice) => {
          const selected = choice.value === value;
          return (
            <Pressable
              key={choice.value}
              accessibilityRole="radio"
              accessibilityLabel={choice.label}
              accessibilityHint={choice.description}
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              onPress={() => onChange(choice.value)}
              className={cn(
                'flex-row items-start gap-3 rounded-lg border-[1.5px] p-4 active:opacity-80',
                selected ? 'border-accent' : 'border-border',
                disabled && !selected && 'opacity-50'
              )}>
              <View className="flex-1 gap-1">
                <Text variant="label">{choice.label}</Text>
                {choice.description ? <Text variant="meta">{choice.description}</Text> : null}
              </View>
              {selected ? (
                <View className="size-[22px] items-center justify-center rounded-full bg-accent">
                  <View className="size-2 rounded-full bg-accent-foreground" />
                </View>
              ) : (
                <View className="size-[22px] rounded-full border-[1.5px] border-muted" />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** A removable or editable pill: a tag, an option's value (with its colour swatch). */
export function ValueChip({
  label,
  accessibilityLabel,
  swatch,
  icon = 'close',
  onPress,
  selected,
  disabled = false,
}: {
  label: string;
  accessibilityLabel: string;
  /** A chip that is one of several to pick: drawn `primary` when picked. */
  selected?: boolean;
  /** A colour, drawn as a dot before the word (an option value's `colorCode`). */
  swatch?: string;
  icon?: IconName;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole={selected === undefined ? 'button' : 'checkbox'}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={selected === undefined ? { disabled } : { disabled, checked: selected }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      className={cn(
        'min-h-9 max-w-full flex-row items-center gap-2 rounded-full py-1.5 pe-2.5 ps-3.5 active:opacity-80',
        selected ? 'bg-primary' : 'bg-surface-alt',
        disabled && 'opacity-50'
      )}>
      {swatch ? (
        <View
          style={{ backgroundColor: swatch }}
          className="size-4 rounded-full border border-border"
        />
      ) : null}
      <Text
        variant="chip"
        numberOfLines={1}
        className={cn('shrink', selected && 'text-primary-foreground')}>
        {label}
      </Text>
      <Icon
        name={icon}
        size={14}
        colorClassName={selected ? 'accent-primary-foreground' : 'accent-muted'}
      />
    </Pressable>
  );
}
