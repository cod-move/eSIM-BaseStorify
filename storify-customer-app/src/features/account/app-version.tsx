import * as Updates from 'expo-updates';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { RowGroup } from '@/components/ui/rows';
import { Text } from '@/components/ui/text';
import { appInfo } from '@/lib/device';

/** The app's version, its build number and the update it is running, at the foot of Settings. */
export function AppVersion() {
  const t = useTranslations('settings');

  return (
    <View className="gap-2">
      <Text variant="subheading">{t('about')}</Text>
      <RowGroup>
        <InfoRow label={t('version')} value={appInfo.version} />
        <InfoRow label={t('build')} value={appInfo.build} />
        <InfoRow label={t('updateId')} value={Updates.updateId ?? t('builtIn')} />
      </RowGroup>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}, ${value}`}
      className="min-h-13 flex-row items-center justify-between gap-3 py-3.5">
      <Text variant="subheading">{label}</Text>
      <Text numberOfLines={1} selectable className="max-w-[60%] text-muted">
        {value}
      </Text>
    </View>
  );
}
