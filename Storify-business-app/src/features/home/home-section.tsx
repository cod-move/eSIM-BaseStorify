import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';

type HomeSectionProps = {
  title: string;
  /** At the end of the title's line: "View all", or a quiet note. */
  action?: ReactNode;
  children: ReactNode;
};

/** A section of Home: its title in `heading`, an optional link at the end, then its content. */
export function HomeSection({ title, action, children }: HomeSectionProps) {
  return (
    <View className="gap-3">
      <View className="min-h-7 flex-row flex-wrap items-center justify-between gap-x-3">
        <Text variant="heading" accessibilityRole="header">
          {title}
        </Text>
        {action}
      </View>
      {children}
    </View>
  );
}
