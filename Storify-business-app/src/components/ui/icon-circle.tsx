import { View } from 'react-native';

import { cn } from '@/lib/cn';

import { Icon, type IconName } from './icon';
import { TONE_ICON, TONE_SOFT, type StatusTone } from './status-chip';

const SIZES = {
  sm: { box: 'size-8', icon: 18 },
  md: { box: 'size-10', icon: 20 },
  lg: { box: 'size-14', icon: 28 },
} as const;

type IconCircleProps = {
  icon: IconName;
  /** The tone's tint behind the icon in the tone's colour; `neutral` is a quiet grey. */
  tone?: StatusTone;
  size?: keyof typeof SIZES;
  className?: string;
};

/**
 * An icon in a tinted circle: a Home tile's mark, a row's leading icon, the
 * alert of an error state. Decoration only: the words beside it say the same.
 */
export function IconCircle({ icon, tone = 'neutral', size = 'sm', className }: IconCircleProps) {
  const dimensions = SIZES[size];

  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      className={cn(
        'items-center justify-center rounded-full',
        dimensions.box,
        TONE_SOFT[tone],
        className
      )}>
      <Icon
        name={icon}
        size={dimensions.icon}
        colorClassName={tone === 'neutral' ? 'accent-foreground' : TONE_ICON[tone]}
      />
    </View>
  );
}
