import { View } from 'react-native';

import { cn } from '@/lib/cn';

type DividerProps = {
  /** A line between things side by side, as between a rating and "N sold". */
  vertical?: boolean;
  className?: string;
};

/** A thin line in the `border` colour. It carries no meaning of its own, so a screen reader skips it. */
export function Divider({ vertical = false, className }: DividerProps) {
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      className={cn(vertical ? 'w-px self-stretch bg-border' : 'h-px w-full bg-border', className)}
    />
  );
}
