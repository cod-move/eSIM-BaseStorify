import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Icon } from '@/components/ui/icon';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import { ACCENT_IDS, ACCENTS, type AccentId } from '@/theme/accents';
import { useThemeStore } from '@/theme/theme-store';
import { useThemeMode } from '@/theme/use-theme';

/** The words of each accent, by key in the `profile` messages. */
const NAMES = {
  blue: 'accentBlue',
  violet: 'accentViolet',
  purple: 'accentPurple',
  pink: 'accentPink',
  red: 'accentRed',
  orange: 'accentOrange',
  amber: 'accentAmber',
  lime: 'accentLime',
  green: 'accentGreen',
  teal: 'accentTeal',
  sand: 'accentSand',
  graphite: 'accentGraphite',
} as const satisfies Record<AccentId, string>;

type SwatchProps = {
  /** The fill, as a colour value. Without one the swatch is the `wash-account-top` token. */
  fill?: string;
  /** The colour of the check on it. Without one the check takes the `foreground` token. */
  check?: string;
  size: 'row' | 'option';
  selected?: boolean;
};

/** A round colour: a white ring and a soft shadow, a check on it when it is the chosen one. */
function Swatch({ fill, check, size, selected = false }: SwatchProps) {
  return (
    <View
      className={cn(
        'items-center justify-center rounded-full border-2 border-on-scrim shadow-button',
        size === 'row' ? 'size-9' : 'size-12',
        !fill && 'bg-wash-account-top'
      )}
      style={fill ? { backgroundColor: fill } : undefined}>
      {selected ? (
        <Icon
          name="check"
          size={size === 'row' ? 18 : 24}
          strokeWidth={3}
          {...(check ? { color: check } : { colorClassName: 'accent-foreground' })}
        />
      ) : null}
    </View>
  );
}

/**
 * The choices, as round swatches that wrap: "Store default" (the app's own
 * wash), then every accent, each a radio named by its colour, the chosen one
 * checked. A pick takes effect at once and is kept on the device.
 */
function AccentOptions({ onPick }: { onPick?: () => void }) {
  const t = useTranslations('profile');
  const mode = useThemeMode();
  const accent = useThemeStore((state) => state.accent);
  const choose = useThemeStore((state) => state.chooseAccent);

  const pick = (next: AccentId | null) => {
    choose(next);
    onPick?.();
  };

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('accent')}
      className="flex-row flex-wrap gap-3">
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel={t('accentDefault')}
        accessibilityState={{ selected: accent === null }}
        onPress={() => pick(null)}
        className="active:opacity-80">
        <Swatch size="option" selected={accent === null} />
      </Pressable>
      {ACCENT_IDS.map((id) => (
        <Pressable
          key={id}
          accessibilityRole="radio"
          accessibilityLabel={t(NAMES[id])}
          accessibilityState={{ selected: accent === id }}
          onPress={() => pick(id)}
          className="active:opacity-80">
          <Swatch
            size="option"
            selected={accent === id}
            fill={ACCENTS[id][mode].swatch}
            check={ACCENTS[id][mode].check}
          />
        </Pressable>
      ))}
    </View>
  );
}

/**
 * "Accent Color" on Profile: the colour of the gradient behind the Account and
 * Profile screens on this phone, from a fixed list. The swatch shows the
 * current one; tapping it opens the list. Buttons keep the store's colours. It
 * is the shopper's setting of the app, not part of their profile, so it is
 * never sent with Save. "Store default" is the app's own wash.
 */
export function AccentPicker() {
  const t = useTranslations('profile');
  const mode = useThemeMode();
  const accent = useThemeStore((state) => state.accent);
  const [open, setOpen] = useState(false);

  const current = accent ? ACCENTS[accent][mode] : undefined;

  return (
    <>
      <View className="flex-row items-center gap-3">
        <Text variant="subheading">{t('accent')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('accent')}
          accessibilityValue={{ text: accent ? t(NAMES[accent]) : t('accentDefault') }}
          hitSlop={6}
          onPress={() => setOpen(true)}
          className="active:opacity-80">
          <Swatch size="row" {...(current ? { fill: current.swatch, check: current.check } : {})} />
        </Pressable>
      </View>

      <Sheet visible={open} onClose={() => setOpen(false)} title={t('accentChoose')}>
        <AccentOptions onPick={() => setOpen(false)} />
        <Text variant="caption" className="mt-4">
          {t('accentNote')}
        </Text>
      </Sheet>
    </>
  );
}

/**
 * "Accent Color" on Settings: the same choice as on Profile, its swatches on a
 * card under the theme's, so that a guest, who has no profile, can pick one too.
 */
export function AccentSection() {
  const t = useTranslations();

  return (
    <View className="gap-2">
      <Text variant="subheading">{t('profile.accent')}</Text>
      <View className="gap-4 rounded-xl bg-surface p-5">
        <AccentOptions />
        <Text variant="caption">{t('settings.accentNote')}</Text>
      </View>
    </View>
  );
}
