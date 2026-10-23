import { useIsFetching } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';

import { AppAsset } from '@/components/ui/app-image';
import { Text } from '@/components/ui/text';
import { useConfig } from '@/features/config/use-config';
import { appInfo } from '@/lib/device';

/**
 * The launch screen, over the app on its first moments while it lays itself
 * out: the store's settings arrive, the first screen asks for its data, the
 * tab bar measures its labels. It is the app's own mark (the icon, the name
 * under it) on the splash screen's colour, with the version at the foot. It
 * leaves once the settings are in and nothing is being fetched, never sooner
 * than `MIN_MS` (no flash) nor later than `MAX_MS`, fading as the mark grows a
 * little, as if the app came forward from behind it.
 *
 * On a phone the native splash screen (app.json: the icon on its colour) comes
 * first, until the settings are in; this cover takes over with the icon in the
 * same place, so only the name and the version appear. On the web the cover is
 * the page's own `#launch` element (`public/index.html`), drawn before any
 * script or stylesheet has loaded: this writes the version into it and fades
 * it away.
 */

const MIN_MS = 900;
const MAX_MS = 6000;
/** A breath after the last fetch, for the first layout and measurements. */
const LAYOUT_MS = 250;
const FADE_MS = 420;
/** The name under the icon: its width, and its distance from the icon. */
const WORDMARK_WIDTH = 136;
const WORDMARK_RATIO = 252 / 82;
const WORDMARK_GAP = 14;

const ICON = require('../../../assets/images/splash-icon.png') as number;
const WORDMARK = require('../../../assets/images/splash-wordmark.png') as number;

type Phase = 'cover' | 'leaving' | 'gone';

export function LaunchCover() {
  const config = useConfig();
  const fetching = useIsFetching();
  const [phase, setPhase] = useState<Phase>('cover');
  const shownAt = useRef(0);
  const idle = (config.data !== undefined || config.isError) && fetching === 0;

  useEffect(() => {
    shownAt.current = Date.now();
    const timer = setTimeout(() => setPhase((now) => (now === 'cover' ? 'leaving' : now)), MAX_MS);
    return () => clearTimeout(timer);
  }, []);

  // Ready: the settings are in and nothing is loading, after a breath for the layout. A fetch
  // that starts in that breath (the first screen's) cancels it, and the wait starts again.
  useEffect(() => {
    if (phase !== 'cover' || !idle) return;
    const early = Math.max(MIN_MS - (Date.now() - shownAt.current), 0);
    const timer = setTimeout(() => setPhase('leaving'), early + LAYOUT_MS);
    return () => clearTimeout(timer);
  }, [idle, phase]);

  const gone = () => setPhase('gone');
  if (Platform.OS === 'web') return <WebLaunch phase={phase} onGone={gone} />;
  if (phase === 'gone') return null;
  return <NativeLaunch phase={phase} onGone={gone} />;
}

type LaunchProps = { phase: Phase; onGone: () => void };

/** Calls the latest `onGone`, so a fade follows the phase alone and not each new callback. */
function useLatest(onGone: () => void) {
  const latest = useRef(onGone);
  useEffect(() => {
    latest.current = onGone;
  });
  return latest;
}

/** The web: the page's own `#launch` element, which the stylesheet does not have to be ready for. */
function WebLaunch({ phase, onGone }: LaunchProps) {
  const t = useTranslations('common');
  const done = useLatest(onGone);
  const version = t('version', { version: appInfo.version });

  useEffect(() => {
    const line = document.getElementById('launch-version');
    if (line) line.textContent = version;
  }, [version]);

  useEffect(() => {
    if (phase !== 'leaving') return;
    const cover = document.getElementById('launch');
    if (!cover) {
      done.current();
      return;
    }
    cover.classList.add('leaving');
    const timer = setTimeout(() => {
      cover.remove();
      done.current();
    }, FADE_MS);
    return () => clearTimeout(timer);
  }, [phase, done]);

  return null;
}

/** The splash screen's colour and icon size (app.json), so the cover takes over from it seamlessly. */
function splashSettings(): { color?: string; iconWidth: number } {
  const plugin = Constants.expoConfig?.plugins?.find(
    (entry) => Array.isArray(entry) && entry[0] === 'expo-splash-screen'
  );
  const options = (Array.isArray(plugin) ? plugin[1] : undefined) as
    { backgroundColor?: string; imageWidth?: number } | undefined;
  return { color: options?.backgroundColor, iconWidth: options?.imageWidth ?? 120 };
}

/** A phone: the icon where the native splash screen had it, the name under it, the version at the foot. */
function NativeLaunch({ phase, onGone }: LaunchProps) {
  const t = useTranslations('common');
  const done = useLatest(onGone);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [opacity] = useState(() => new Animated.Value(1));
  const [arrive] = useState(() => new Animated.Value(0));
  const { color, iconWidth } = splashSettings();

  // The name and the version arrive under the icon the native splash screen left in place.
  useEffect(() => {
    const show = Animated.timing(arrive, {
      toValue: 1,
      duration: 360,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    show.start();
    return () => show.stop();
  }, [arrive]);

  useEffect(() => {
    if (phase !== 'leaving') return;
    const fade = Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    fade.start(({ finished }) => {
      if (finished) done.current();
    });
    return () => fade.stop();
  }, [phase, opacity, done]);

  const scale = opacity.interpolate({ inputRange: [0, 1], outputRange: [1.08, 1] });
  const rise = arrive.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });

  return (
    <Animated.View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('loading')}
      pointerEvents={phase === 'leaving' ? 'none' : 'auto'}
      className={color ? undefined : 'bg-background'}
      style={[StyleSheet.absoluteFill, { opacity }, color ? { backgroundColor: color } : null]}>
      <Animated.View
        className="absolute inset-0 items-center justify-center"
        style={{ transform: [{ scale }] }}>
        <View style={{ width: iconWidth, height: iconWidth }}>
          <AppAsset source={ICON} className="size-full" />
        </View>
      </Animated.View>
      <Animated.View
        className="absolute inset-x-0 items-center"
        style={{
          top: height / 2 + iconWidth / 2 + WORDMARK_GAP,
          opacity: arrive,
          transform: [{ translateY: rise }, { scale }],
        }}>
        <View style={{ width: WORDMARK_WIDTH, height: WORDMARK_WIDTH / WORDMARK_RATIO }}>
          <AppAsset source={WORDMARK} className="size-full" />
        </View>
      </Animated.View>
      <Animated.View
        className="absolute inset-x-0 items-center"
        style={{ bottom: insets.bottom + 28, opacity: arrive }}>
        <Text variant="caption" className="text-on-scrim opacity-70">
          {t('version', { version: appInfo.version })}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}
