import { Children, isValidElement, type ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { cn } from '@/lib/cn';

import { Icon, type IconName } from './icon';
import { PressableScale } from './press-motion';
import { TONE_ICON, TONE_SOFT, type StatusTone } from './status-chip';
import { Text } from './text';

/** Past this text size, two tiles side by side no longer fit their figures: one per row. */
const ONE_PER_ROW_SCALE = 1.35;
/** On a screen narrower than this (a small phone zoomed in), one per row as well. */
const ONE_PER_ROW_WIDTH = 300;

type TileProps = {
  icon: IconName;
  /** What the figure counts: "Orders needing action". */
  label: string;
  /** The figure, as it is shown: a count formatted in the operator's language, or money as the store formatted it. */
  value: string;
  /**
   * The icon's tone. A count that asks for attention passes its tone when it
   * is above zero, and `neutral` at zero.
   */
  tone?: StatusTone;
  /**
   * `quiet`: a figure that asks for nothing (a zero), drawn in `muted` so the
   * work that waits stands out. `missing`: the store sent no figure, and
   * `value` says so in words, in a smaller size than a figure.
   */
  emphasis?: 'normal' | 'quiet' | 'missing';
  /** What a screen reader says; "{label}, {value}" unless the screen words it. */
  accessibilityLabel?: string;
  /** Opens the list the figure counts. Without it, the tile is a figure only. */
  onPress?: () => void;
  /**
   * Takes a whole row of the grid. Money always does: a store's amounts run
   * long, and only a phone can shrink a figure to fit (the browser preview cuts it).
   */
  wide?: boolean;
  className?: string;
};

/**
 * A Home figure: a `surface` card with the figure
 * and its icon, on a tinted square, on one line, and what it counts under
 * them. The whole tile is one button.
 */
export function Tile({
  icon,
  label,
  value,
  tone = 'neutral',
  emphasis = 'normal',
  accessibilityLabel,
  onPress,
  className,
}: TileProps) {
  const spoken = accessibilityLabel ?? `${label}, ${value}`;
  const body = (
    <>
      <View className="min-h-10 flex-row items-center justify-between gap-2">
        <Text
          variant={emphasis === 'missing' ? 'label' : 'metric'}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          className={cn('shrink', emphasis !== 'normal' && 'text-muted')}>
          {value}
        </Text>
        <View
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          className={cn('size-10 items-center justify-center rounded-[14px]', TONE_SOFT[tone])}>
          <Icon name={icon} size={20} colorClassName={TONE_ICON[tone]} />
        </View>
      </View>
      <Text variant="meta" numberOfLines={2}>
        {label}
      </Text>
    </>
  );
  const box = cn('flex-1 gap-1.5 rounded-[22px] bg-surface p-4', className);

  return onPress ? (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={spoken}
      onPress={onPress}
      className={cn(box, 'active:opacity-90')}>
      {body}
    </PressableScale>
  ) : (
    <View accessible accessibilityLabel={spoken} className={box}>
      {body}
    </View>
  );
}

/**
 * Tiles two to a row, 12 pt apart; a `wide` tile takes a row of its own, and
 * at the largest text sizes, or on the narrowest screens, every tile does.
 */
export function TileGrid({ children, className }: { children: ReactNode; className?: string }) {
  const { fontScale, width } = useWindowDimensions();
  const single = fontScale >= ONE_PER_ROW_SCALE || width < ONE_PER_ROW_WIDTH;
  const tiles = Children.toArray(children).filter(isValidElement<TileProps>);

  const rows: (typeof tiles)[] = [];
  for (const tile of tiles) {
    const last = rows[rows.length - 1];
    if (!single && !tile.props.wide && last?.length === 1 && !last[0]?.props.wide) {
      last.push(tile);
    } else {
      rows.push([tile]);
    }
  }

  return (
    <View className={cn('gap-3', className)}>
      {rows.map((row, index) => (
        <View key={index} className="flex-row gap-3">
          {row}
          {/* A lone half-width tile keeps its half: an empty space takes the other. */}
          {row.length === 1 && !row[0]?.props.wide && !single ? <View className="flex-1" /> : null}
        </View>
      ))}
    </View>
  );
}
