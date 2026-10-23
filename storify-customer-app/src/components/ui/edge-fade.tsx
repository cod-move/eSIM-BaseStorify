import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { transparentOf } from '@/components/shell/fade-color';
import { useRtl } from '@/i18n/use-rtl';

/**
 * A fade into the page's colour over the end of a row that scrolls sideways,
 * so the row reads as one that goes on. Put it after the row, inside a view
 * that holds the row alone; taps pass through it to the cards under it.
 */
export function EdgeFade({ width = 32 }: { width?: number }) {
  const background = String(useCSSVariable('--color-background') ?? '');
  const rtl = useRtl();
  // A gradient runs on the screen's axis; on a right-to-left page the end is the left edge.
  const colors = [transparentOf(background), background] as const;

  return (
    <View
      className="absolute inset-y-0 end-0"
      style={{ width, pointerEvents: 'none' }}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden>
      <LinearGradient
        colors={rtl ? [colors[1], colors[0]] : colors}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ flex: 1 }}
      />
    </View>
  );
}

/**
 * A fade from the page's colour over the top of a list that scrolls under
 * something fixed above it (a conversation's header), so what scrolls away
 * melts into the page instead of being cut off. Put it after the list, inside
 * a view that holds the list alone; taps pass through it.
 */
export function TopFade({ height = 28 }: { height?: number }) {
  const background = String(useCSSVariable('--color-background') ?? '');

  return (
    <View
      className="absolute inset-x-0 top-0"
      style={{ height, pointerEvents: 'none' }}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden>
      <LinearGradient colors={[background, transparentOf(background)]} style={{ flex: 1 }} />
    </View>
  );
}
