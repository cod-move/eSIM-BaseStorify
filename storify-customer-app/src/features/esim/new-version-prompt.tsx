import { openURL } from 'expo-linking';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import type { AppRelease } from '@/contracts/mobile/shop/v1';
import { appInfo } from '@/lib/device';
import { storage } from '@/lib/storage';
import { compareVersions } from '@/lib/version';

const DISMISSED_KEY = 'esim.new-version-dismissed';
/** "Later" is remembered for this long per version, then the app asks again. */
const QUIET_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Whether to offer the store's latest version: this one is older than it but
 * not below the minimum (that is the official update prompt's job), and the
 * shopper has not said "later" to that version in the last three days.
 */
export function offersNewVersion(
  release: AppRelease | undefined,
  version: string,
  dismissed: { version: string; at: number } | null,
  now: number
): boolean {
  const latest = release?.latestVersion?.trim();
  if (!latest || compareVersions(version, latest) >= 0) return false;
  const min = release?.minVersion?.trim();
  if (min && compareVersions(version, min) < 0) return false;
  return !(dismissed && dismissed.version === latest && now - dismissed.at < QUIET_MS);
}

function readDismissed(): { version: string; at: number } | null {
  try {
    const value = JSON.parse(storage.get(DISMISSED_KEY) ?? 'null');
    return typeof value?.version === 'string' && typeof value?.at === 'number' ? value : null;
  } catch {
    return null;
  }
}

/**
 * "A new version is out": offered once the admin's latest version is newer
 * than this one, while this one is still supported. The shopper may update or
 * close it; closing keeps it away for that version for three days.
 */
export function NewVersionPrompt({ release }: { release: AppRelease | undefined }) {
  const t = useTranslations('esim.update');
  const [dismissed, setDismissed] = useState(readDismissed);
  const visible = offersNewVersion(release, appInfo.version, dismissed, Date.now());
  const latest = release?.latestVersion?.trim() ?? '';
  const storeUrl = release?.storeUrl?.trim();

  const later = () => {
    const value = { version: latest, at: Date.now() };
    storage.set(DISMISSED_KEY, JSON.stringify(value));
    setDismissed(value);
  };

  return (
    <Sheet
      visible={visible}
      title={t('title')}
      onClose={later}
      footer={
        <View className="gap-2">
          {storeUrl ? <Button label={t('action')} onPress={() => void openURL(storeUrl)} /> : null}
          <Button variant="ghost" label={t('later')} onPress={later} />
        </View>
      }>
      <Text variant="caption" className="text-center text-base">
        {t('body', { latest, current: appInfo.version })}
      </Text>
    </Sheet>
  );
}
