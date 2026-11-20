import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Icon } from '@/components/ui/icon';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';

import { DestinationFlag } from './destination-flag';

/** Flags shown in the row before "+N". */
const STACKED = 7;
const SIZE = 30;

const flagOf = (code: string) => ({ scope: 'local' as const, countries: [code], emoji: undefined });

/**
 * Where a region or global plan works, in one line: the first flags stacked,
 * "+N" for the rest and the count; a tap opens every country by name.
 */
export function CoverageFlags({ countries }: { countries: { code: string; name: string }[] }) {
  const t = useTranslations('esim');
  const [open, setOpen] = useState(false);
  if (!countries.length) return null;
  const shown = countries.slice(0, STACKED);
  const rest = countries.length - shown.length;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('countryCount', { count: countries.length })}
        onPress={() => setOpen(true)}
        className="flex-row items-center gap-2 active:opacity-70">
        <View className="flex-row items-center">
          {shown.map((country, index) => (
            <View key={country.code} style={{ marginStart: index ? -SIZE * 0.35 : 0, zIndex: STACKED - index }}>
              <DestinationFlag destination={flagOf(country.code)} size={SIZE} />
            </View>
          ))}
          {rest > 0 ? (
            <View
              style={{ width: SIZE, height: SIZE, marginStart: -SIZE * 0.35 }}
              className="items-center justify-center rounded-full bg-surface-alt">
              <Text variant="caption" className="text-[11px]">{`+${rest}`}</Text>
            </View>
          ) : null}
        </View>
        <Text variant="caption" className="flex-1 text-link" numberOfLines={1}>
          {t('countryCount', { count: countries.length })}
        </Text>
        <Icon name="chevron-right" size={16} directional colorClassName="accent-link" />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={t('planCoverage')} size="tall">
        <View className="gap-1 pb-4">
          {countries.map((country) => (
            <View key={country.code} className="flex-row items-center gap-3 py-2">
              <DestinationFlag destination={flagOf(country.code)} size={28} />
              <Text className="flex-1">{country.name}</Text>
            </View>
          ))}
        </View>
      </Sheet>
    </>
  );
}
