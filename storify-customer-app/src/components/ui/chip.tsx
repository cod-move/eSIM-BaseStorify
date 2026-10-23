import { Pressable, View, type PressableProps } from 'react-native';
import { useTranslations } from 'use-intl';

import type { ImageSet } from '@/contracts/mobile/shop/v1';
import { cn } from '@/lib/cn';

import { AppImage } from './app-image';
import { Text } from './text';

/**
 * The app's chips. "Selected" is `primary` in every kind.
 *
 * - `picture`: a pill with a round picture at the start (category chips).
 * - `filter`: a text pill (the filter sheet, "All" first).
 * - `option`: a rounded rectangle for a product option: its text, a colour
 *   `swatch`, or a small `image`.
 *
 * A chip is 26 to 28 pt tall and reaches 44 pt through `hitSlop`.
 */
const KINDS = {
  picture: {
    box: 'min-h-9 gap-2 rounded-full ps-0.5 pe-3.5',
    off: 'bg-surface',
  },
  filter: {
    box: 'min-h-7 rounded-full px-4',
    off: 'bg-surface dark:bg-surface-alt',
  },
  option: {
    box: 'min-h-[27px] min-w-[76px] gap-2 rounded-sm px-3',
    off: 'border border-border',
  },
} as const;

type ChipKind = keyof typeof KINDS;

export type ChipProps = Omit<PressableProps, 'children'> & {
  label: string;
  kind?: ChipKind;
  selected?: boolean;
  /**
   * Dimmed but still tappable: an option the product does not come in right
   * now. The shopper may choose it and be told why it cannot be bought.
   */
  unavailable?: boolean;
  /** The round picture of a `picture` chip, or the small picture of an `option`. */
  image?: ImageSet;
  /** The colour of an `option` that is a colour, as the store gives it (a hex value). */
  swatch?: string;
  /**
   * Near-black with light words, the same in both themes: the first of a row of picture chips,
   * as the design draws it. It is a look, not a choice; `selected` still says what is chosen.
   */
  ink?: boolean;
  className?: string;
};

export function Chip({
  label,
  kind = 'filter',
  selected = false,
  unavailable = false,
  image,
  swatch,
  ink = false,
  disabled,
  className,
  ...props
}: ChipProps) {
  const t = useTranslations('catalog');
  const styles = KINDS[kind];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unavailable ? t('unavailableOption', { label }) : label}
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={{ top: 9, bottom: 9 }}
      className={cn(
        'flex-row items-center justify-center self-start active:opacity-90',
        styles.box,
        selected
          ? 'border border-primary bg-primary'
          : ink
            ? 'border border-scrim bg-scrim'
            : styles.off,
        disabled && 'opacity-40',
        unavailable && 'opacity-50',
        className
      )}
      {...props}>
      {kind === 'picture' ? (
        <AppImage
          image={image}
          size="thumb"
          decorative
          className="size-8 rounded-full bg-surface-alt"
        />
      ) : null}
      {kind === 'option' && image ? (
        <AppImage image={image} size="thumb" decorative className="size-[18px] rounded-sm" />
      ) : null}
      {kind === 'option' && swatch ? (
        <View
          className="size-[14px] rounded-full border border-border"
          style={{ backgroundColor: swatch }}
        />
      ) : null}
      <Text
        variant="chip"
        numberOfLines={1}
        className={selected ? 'text-primary-foreground' : ink ? 'text-on-scrim' : undefined}>
        {label}
      </Text>
    </Pressable>
  );
}
