import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import type { IconName } from '@/components/ui/icon';
import { IconCircle } from '@/components/ui/icon-circle';
import type { StatusTone } from '@/components/ui/status-chip';
import { Text } from '@/components/ui/text';

type GateAction = { label: string; onPress: () => void };

type GateScreenProps = {
  icon: IconName;
  tone?: StatusTone;
  title: string;
  body: string;
  /** The way on, pinned at the bottom: "Update", "Try again". */
  action?: GateAction;
  /** A quieter way out under it: "Not now", "Sign out". */
  secondary?: GateAction & { destructive?: boolean };
};

/**
 * A full screen in place of the app: update required,
 * the business app switched off, the store unreachable, no access. An icon
 * in its tone, the title, what it means, and the action at the bottom, where
 * the thumb is.
 */
export function GateScreen({
  icon,
  tone = 'neutral',
  title,
  body,
  action,
  secondary,
}: GateScreenProps) {
  return (
    <View className="flex-1 bg-background px-6 pt-safe-offset-6 pb-safe-offset-6">
      <View className="w-full max-w-[440px] flex-1 justify-center gap-3 self-center">
        <IconCircle icon={icon} tone={tone} size="lg" className="mb-3" />
        <Text variant="display" accessibilityRole="header">
          {title}
        </Text>
        <Text className="text-muted">{body}</Text>
      </View>
      {action || secondary ? (
        <View className="w-full max-w-[440px] gap-3 self-center">
          {action ? (
            <Button label={action.label} variant="accent" onPress={action.onPress} />
          ) : null}
          {secondary ? (
            <Button
              label={secondary.label}
              variant="ghost"
              destructive={secondary.destructive}
              onPress={secondary.onPress}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
