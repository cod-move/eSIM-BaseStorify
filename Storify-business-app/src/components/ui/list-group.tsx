import type { ReactNode } from 'react';
import { View } from 'react-native';

import { cn } from '@/lib/cn';

import { SkeletonRows } from './skeleton';
import { InlineError } from './state-view';

/**
 * A long list (FlashList) drawn as one group, and its
 * end. Its pull to refresh is `usePullToRefresh` (lib).
 */

type GroupedItemProps = {
  /** The row's place in the list. */
  index: number;
  /** How many rows the list shows now. */
  count: number;
  /**
   * Where the line above the row starts: under the text (`text`, the default)
   * or past a leading thumbnail or avatar (`leading`), as in `RowGroup`.
   */
  divider?: 'text' | 'leading';
  children: ReactNode;
};

/**
 * One row of a long list drawn as part of one group: the `surface` card, its
 * corners and the lines between rows of a `RowGroup`, given row by row so the
 * list can still recycle its rows. The list's content keeps the screen's
 * gutter (16 pt at each side), and passes its row count as `extraData`, so
 * the last row loses its corners, and gains its line, when more arrive.
 *
 * The line is under each row but the last, so the rows FlashList places
 * before measuring them are as tall as the ones it measured: it overlooks a
 * difference of a pixel, which a line above each row but the first left
 * between a shorter first row and the rest (half a point per row on 2x screens).
 */
export function GroupedItem({ index, count, divider = 'text', children }: GroupedItemProps) {
  const first = index === 0;
  const last = index === count - 1;

  return (
    <View
      className={cn('overflow-hidden bg-surface', first && 'rounded-t-xl', last && 'rounded-b-xl')}>
      {children}
      {last ? null : (
        <View
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          className={cn('h-px bg-border', divider === 'leading' ? 'ms-[72px]' : 'ms-4')}
        />
      )}
    </View>
  );
}

type ListEndProps = {
  /** The next page is on its way: skeleton rows under the last. */
  loading?: boolean;
  /**
   * The next page or a refresh failed: the reason and "Try again". The rows
   * above stay. While the page is asked for again, its skeleton rows show instead.
   */
  error?: unknown;
  onRetry?: () => void;
  /** The list's rows have a thumbnail or an avatar at the start. */
  leading?: boolean;
};

/** The end of a long list. */
export function ListEnd({ loading = false, error, onRetry, leading = false }: ListEndProps) {
  if (loading) return <SkeletonRows rows={2} leading={leading} className="mt-3" />;
  if (error && onRetry) return <InlineError error={error} onRetry={onRetry} className="mt-3" />;
  return null;
}
