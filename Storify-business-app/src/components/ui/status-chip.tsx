import { View } from 'react-native';

import { cn } from '@/lib/cn';

import { Text } from './text';

/**
 * The five tones of a status:
 *
 * - `neutral`: finished and asking nothing (cancelled, draft, closed), or a
 *   status the app does not know;
 * - `info`: in progress (processing, shipped);
 * - `success`: done (delivered, paid, approved);
 * - `warning`: waiting on the operator (pending, unpaid, low stock);
 * - `danger`: went wrong (failed, expired, rejected).
 *
 * Which status gets which tone is the features' (`features/status`), so that
 * every screen says the same thing.
 */
const TONES = {
  neutral: { box: 'bg-surface-alt', dot: 'bg-muted' },
  info: { box: 'bg-info-soft', dot: 'bg-info' },
  success: { box: 'bg-success-soft', dot: 'bg-success' },
  warning: { box: 'bg-warning-soft', dot: 'bg-warning' },
  danger: { box: 'bg-danger-soft', dot: 'bg-danger' },
} as const;

export type StatusTone = keyof typeof TONES;

/** The fill of a tone's `-soft` tint, for something drawn in a tone (an icon circle, a banner). */
export const TONE_SOFT: Record<StatusTone, string> = {
  neutral: 'bg-surface-alt',
  info: 'bg-info-soft',
  success: 'bg-success-soft',
  warning: 'bg-warning-soft',
  danger: 'bg-danger-soft',
};

/** A tone's strong colour for an icon. */
export const TONE_ICON = {
  neutral: 'accent-muted',
  info: 'accent-info',
  success: 'accent-success',
  warning: 'accent-warning',
  danger: 'accent-danger',
} as const satisfies Record<StatusTone, string>;

type StatusChipProps = {
  tone: StatusTone;
  /** The status in words, in the operator's language. The colour only repeats it. */
  label: string;
  className?: string;
};

/**
 * A status at a glance: a tinted pill, a dot in the tone's colour, and the
 * word in `foreground`, so it reads in both themes and never by colour alone.
 */
export function StatusChip({ tone, label, className }: StatusChipProps) {
  const styles = TONES[tone];

  return (
    <View
      accessible
      accessibilityLabel={label}
      className={cn(
        'min-h-[22px] flex-row items-center gap-1.5 self-start rounded-full px-2 py-0.5',
        styles.box,
        className
      )}>
      <View className={cn('size-1.5 rounded-full', styles.dot)} />
      <Text variant="status" numberOfLines={1} className="shrink">
        {label}
      </Text>
    </View>
  );
}
