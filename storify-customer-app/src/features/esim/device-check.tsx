import * as Device from 'expo-device';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { Icon } from '@/components/ui/icon';
import { SearchField } from '@/components/ui/search-field';
import { Text } from '@/components/ui/text';
import type { EsimDevices } from '@/contracts/mobile/shop/v1/esim';
import { cn } from '@/lib/cn';

import { matchDevice } from './device-match';

/**
 * Does this phone take an eSIM (APP-05): the store's device table, this
 * phone looked up in it, and a search for any other.
 */
export function DeviceCheck({ devices }: { devices: EsimDevices }) {
  const t = useTranslations('esim');
  const tabBar = useTabBarHeight();
  const verdict = matchDevice(devices, {
    brand: Device.brand,
    manufacturer: Device.manufacturer,
    modelName: Device.modelName,
  });
  const [query, setQuery] = useState(verdict.kind === 'unknown' ? (verdict.brand ?? '') : '');

  const found = useMemo(() => {
    const words = query.trim().toLowerCase();
    return devices.brands
      .map((entry) => ({
        brand: entry.brand,
        models: entry.models.filter(
          (model) => !words || `${entry.brand} ${model.name}`.toLowerCase().includes(words)
        ),
      }))
      .filter((entry) => entry.models.length > 0);
  }, [devices, query]);

  const thisPhone = [Device.manufacturer ?? Device.brand, Device.modelName]
    .filter(Boolean)
    .join(' ');

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 px-4 pt-3"
      contentContainerStyle={{ paddingBottom: tabBar + 16 }}
      keyboardShouldPersistTaps="handled">
      <View
        className={cn(
          'gap-2 rounded-xl border-[1.5px] bg-surface p-4',
          verdict.kind === 'supported'
            ? 'border-success'
            : verdict.kind === 'unsupported'
              ? 'border-danger'
              : 'border-surface'
        )}>
        <Text variant="caption">{t('thisPhone', { phone: thisPhone || t('unknownPhone') })}</Text>
        <View className="flex-row items-center gap-2">
          <Icon
            name={
              verdict.kind === 'supported'
                ? 'check-circle'
                : verdict.kind === 'unsupported'
                  ? 'close'
                  : 'help'
            }
            size={24}
            colorClassName={
              verdict.kind === 'supported'
                ? 'accent-success'
                : verdict.kind === 'unsupported'
                  ? 'accent-danger'
                  : 'accent-muted'
            }
          />
          <Text variant="subheading" className="flex-1">
            {verdict.kind === 'supported'
              ? t('phoneSupported')
              : verdict.kind === 'unsupported'
                ? t('phoneUnsupported')
                : t('phoneUnknown')}
          </Text>
        </View>
        {verdict.kind !== 'unknown' && verdict.note ? (
          <Text variant="caption">{verdict.note}</Text>
        ) : null}
        <Text variant="caption">{t('deviceCaution')}</Text>
      </View>

      <SearchField label={t('searchDevices')} value={query} onChangeText={setQuery} />
      {found.length === 0 ? (
        <Text className="py-6 text-center text-muted">{t('noDevices')}</Text>
      ) : (
        found.map((entry) => (
          <View key={entry.brand} className="gap-1 rounded-xl bg-surface p-4">
            <Text variant="subheading">{entry.brand}</Text>
            {entry.models.map((model) => (
              <View key={model.name} className="flex-row items-start gap-2 py-0.5">
                <Icon
                  name={model.supported ? 'check' : 'close'}
                  size={16}
                  colorClassName={model.supported ? 'accent-success' : 'accent-danger'}
                />
                <View className="flex-1">
                  <Text>{model.name}</Text>
                  {model.note ? <Text variant="caption">{model.note}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        ))
      )}
    </ScrollView>
  );
}
