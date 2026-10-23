import { View } from 'react-native';

import { cn } from '@/lib/cn';

import { TextLink } from './button';
import { Icon, type IconName } from './icon';
import { TONE_ICON, TONE_SOFT, type StatusTone } from './status-chip';
import { Text } from './text';

const ICONS: Record<StatusTone, IconName> = {
  neutral: 'alert-circle',
  info: 'alert-circle',
  success: 'check-circle',
  warning: 'warning',
  danger: 'alert-circle',
};

type BannerProps = {
  tone: StatusTone;
  /** One or two lines, in the operator's language. */
  message: string;
  /** A bolder first line, when the message needs one. */
  title?: string;
  /** An icon other than the tone's own: `wifi-off` when offline. */
  icon?: IconName;
  /** One way on: "Open the website". */
  action?: { label: string; onPress: () => void };
  className?: string;
};

/**
 * A notice across the width of the screen or a form, in its tone's tint: a
 * sign-in refusal, being offline, a shop awaiting payment, an order somebody
 * else changed. It is announced when it appears.
 */
export function Banner({ tone, message, title, icon, action, className }: BannerProps) {
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className={cn('flex-row gap-3 rounded-xl px-4 py-3', TONE_SOFT[tone], className)}>
      <View className="pt-px">
        <Icon name={icon ?? ICONS[tone]} size={20} colorClassName={TONE_ICON[tone]} />
      </View>
      <View className="flex-1 gap-1">
        {title ? <Text variant="label">{title}</Text> : null}
        <Text>{message}</Text>
        {action ? (
          <TextLink
            label={action.label}
            tone="foreground"
            onPress={action.onPress}
            className="mt-1 self-start"
          />
        ) : null}
      </View>
    </View>
  );
}
