import {
  Platform,
  Switch as NativeSwitch,
  type SwitchProps as NativeSwitchProps,
} from 'react-native';
import { useCSSVariable } from 'uniwind';

export type SwitchProps = Omit<
  NativeSwitchProps,
  | 'trackColor'
  | 'thumbColor'
  | 'ios_backgroundColor'
  | 'trackColorOnClassName'
  | 'trackColorOffClassName'
  | 'thumbColorClassName'
  | 'ios_backgroundColorClassName'
>;

/**
 * The phone's own switch, in the app's colours:
 * an `accent` track when on, `surface-alt` when off, and a white knob,
 * which is what shows the state on the dark theme's accent. The colours
 * are tokens, handed over through Uniwind's colour class props, so they follow
 * the theme and the store's brand.
 *
 * Give it an `accessibilityLabel`; inside a switch row the row names it.
 */
export function Switch(props: SwitchProps) {
  // The browser preview draws React Native Web's switch, which takes the knob's
  // colour when on from a prop of its own; without it the knob is teal.
  const [knob] = useCSSVariable(['--color-accent-foreground']);
  const web = Platform.OS === 'web' ? ({ activeThumbColor: String(knob) } as object) : null;

  return (
    <NativeSwitch
      trackColorOnClassName="accent-accent"
      trackColorOffClassName="accent-surface-alt"
      thumbColorClassName="accent-accent-foreground"
      ios_backgroundColorClassName="accent-surface-alt"
      {...web}
      {...props}
    />
  );
}
