import { View } from 'react-native';

import { cn } from '@/lib/cn';

import { Icon, type IconName, type IconTint } from './icon';

/**
 * The tones of an icon circle: a soft tint of a token behind the icon in the
 * token itself. `neutral` is a quiet grey with the icon in `foreground`.
 */
const TONES = {
  neutral: { box: 'bg-surface-alt', icon: 'accent-foreground' },
  accent: { box: 'bg-accent/15', icon: 'accent-accent' },
  success: { box: 'bg-success/15', icon: 'accent-success' },
  warning: { box: 'bg-warning/15', icon: 'accent-warning' },
} as const satisfies Record<string, { box: string; icon: IconTint }>;

export type IconCircleTone = keyof typeof TONES;

type IconCircleProps = {
  icon: IconName;
  tone?: IconCircleTone;
  className?: string;
};

/**
 * A 40 pt icon in a tinted circle at the start of a row: what a notification
 * is about, what an option adds to a message. Decoration only: the words
 * beside it say the same.
 */
export function IconCircle({ icon, tone = 'neutral', className }: IconCircleProps) {
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      className={cn(
        'size-10 items-center justify-center rounded-full',
        TONES[tone].box,
        className
      )}>
      <Icon name={icon} size={20} colorClassName={TONES[tone].icon} />
    </View>
  );
}
