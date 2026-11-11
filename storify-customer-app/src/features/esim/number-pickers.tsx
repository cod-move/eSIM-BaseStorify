import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Chip } from '@/components/ui/chip';
import { RadioRow, RowGroup } from '@/components/ui/rows';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import type { EsimNumberPacketGroup, EsimNumberRecharge } from '@/contracts/mobile/shop/v1/esim';

import { rechargeValid } from './number-money';

/** Countries named in a group's line before "+N". */
const SHOWN_COUNTRIES = 6;

/** The credit picked: a suggested amount, or the shopper's own whole amount. */
export function chosenRecharge(preset: number, custom: string): number {
  return custom ? Number(custom) * 100 : preset;
}

/**
 * Credit on a number (NUM-04/08): the website's suggested amounts, or another
 * whole amount, from the store's minimum up to its maximum, in the card's currency.
 */
export function RechargePicker({
  recharge,
  preset,
  custom,
  onPreset,
  onCustom,
}: {
  recharge: EsimNumberRecharge;
  preset: number;
  custom: string;
  onPreset: (minor: number) => void;
  onCustom: (value: string) => void;
}) {
  const t = useTranslations('esim.numbers');
  const minor = chosenRecharge(preset, custom);
  const valid = rechargeValid(minor, recharge.minMinor, recharge.maxMinor);

  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-2">
        {recharge.suggestions.map((entry) => (
          <Chip
            key={entry.minor}
            kind="option"
            label={entry.money.formatted}
            selected={!custom && preset === entry.minor}
            onPress={() => {
              onCustom('');
              onPreset(entry.minor);
            }}
          />
        ))}
      </View>
      <TextField
        label={t('otherAmount', { currency: recharge.currency })}
        keyboardType="number-pad"
        value={custom}
        onChangeText={(text) => onCustom(text.replace(/\D/g, '').slice(0, 3))}
        error={
          custom && !valid
            ? t('rechargeAmounts', { min: recharge.min.formatted, max: recharge.max.formatted })
            : undefined
        }
        hint={
          recharge.usdPerUnit === null
            ? t('creditUnpriced')
            : t('rechargeAmounts', { min: recharge.min.formatted, max: recharge.max.formatted })
        }
      />
    </View>
  );
}

/**
 * Data packages grouped by the countries they cover, as the website's picker
 * lists them; `allowNone` adds "No data package" first.
 */
export function PacketPicker({
  groups,
  value,
  onChange,
  allowNone,
}: {
  groups: EsimNumberPacketGroup[];
  value: string | null;
  onChange: (id: string | null) => void;
  allowNone?: boolean;
}) {
  const t = useTranslations('esim.numbers');

  return (
    <View className="gap-3">
      {allowNone ? (
        <RowGroup>
          <RadioRow
            title={t('noPacket')}
            selected={value === null}
            onSelect={() => onChange(null)}
          />
        </RowGroup>
      ) : null}
      {groups.map((group) => {
        const names = group.countries.map((country) => country.name);
        const shown = names.slice(0, SHOWN_COUNTRIES).join(', ');
        return (
          <View key={group.key} className="gap-1.5">
            <Text variant="caption" className="text-foreground">
              {names.length === 0
                ? t('packetWorldwide')
                : names.length > SHOWN_COUNTRIES
                  ? t('packetCountriesMore', {
                      countries: shown,
                      count: names.length - SHOWN_COUNTRIES,
                    })
                  : shown}
            </Text>
            <RowGroup>
              {group.packets.map((packet) => (
                <RadioRow
                  key={packet.id}
                  title={`${packet.volume} · ${t('days', { count: packet.validityDays })}`}
                  description={[
                    packet.name,
                    packet.price.formatted,
                    packet.perGb ? t('perGb', { price: packet.perGb.formatted }) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  selected={value === packet.id}
                  onSelect={() => onChange(packet.id)}
                />
              ))}
            </RowGroup>
          </View>
        );
      })}
    </View>
  );
}
