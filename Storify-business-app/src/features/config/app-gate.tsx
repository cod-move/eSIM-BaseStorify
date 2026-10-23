import { openURL } from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { Platform, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { isApiError } from '@/api/errors';
import { useGate } from '@/api/gate';
import type { Config } from '@/contracts/mobile/biz/v1';
import { appInfo } from '@/lib/device';
import { compareVersions } from '@/lib/version';
import { useThemeSync } from '@/theme/use-theme';

import { GateScreen } from './gate-screen';
import { useConfig } from './use-config';
import { useLocaleSync } from './use-locale-sync';

/**
 * Stands between the providers and the screens. It loads the store's settings,
 * applies the store's theme and language, and decides whether the app may open
 * at all.
 *
 * The native splash screen stays up until there is something to show: the app
 * (from the settings kept on the device, so at once on every start but the
 * first), or one of these screens in its place:
 *
 * - update the app: this version is below the store's minimum, or the store
 *   refused a change as too old (426). "Not now" lets the operator go on
 *   reading, as the contract allows an old version to; the next change the
 *   store refuses brings the screen back;
 * - the business app is switched off on this store (`ROUTE_NOT_FOUND`);
 * - cannot reach the store (first start with no connection).
 *
 * There is no maintenance screen: the store's maintenance mode never closes
 * the business app.
 */
export function AppGate({ children }: PropsWithChildren) {
  const t = useTranslations('gate');
  const tCommon = useTranslations('common');
  const config = useConfig();
  const updateRequired = useGate((gate) => gate.updateRequired);
  const dismissUpdate = useGate((gate) => gate.dismissUpdate);
  // The minimum the operator said "not now" to, for as long as the app runs.
  const [notNow, setNotNow] = useState<string | null>(null);

  useThemeSync(config.data);
  useLocaleSync(config.data, config.error);

  const settled = config.data !== undefined || config.isError;
  useEffect(() => {
    if (settled) SplashScreen.hide();
  }, [settled]);

  const release = releaseOf(config.data);
  const tooOld =
    release?.minVersion !== undefined &&
    release.minVersion !== notNow &&
    compareVersions(appInfo.version, release.minVersion) < 0;

  if (!config.data) {
    // Still loading: the splash screen is showing.
    if (!config.isError) return null;
    const switchedOff = isApiError(config.error) && config.error.code === 'ROUTE_NOT_FOUND';
    return (
      <GateScreen
        icon={switchedOff ? 'lock' : 'wifi-off'}
        title={switchedOff ? t('switchedOffTitle') : t('unavailableTitle')}
        body={switchedOff ? t('switchedOffBody') : t('unavailableBody')}
        action={{ label: tCommon('retry'), onPress: () => void config.refetch() }}
      />
    );
  }

  const updating = Boolean(updateRequired || tooOld);
  const storeUrl = updateRequired?.storeUrl ?? release?.storeUrl;

  // The update screen lies over the app, never in its place: after "Not now"
  // the operator is back on the screen they were on, with what they typed.
  return (
    <>
      <View
        className="flex-1"
        importantForAccessibility={updating ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={updating}>
        {children}
      </View>
      {updating ? (
        <View className="absolute inset-0" accessibilityViewIsModal>
          <GateScreen
            icon="refresh"
            tone="warning"
            title={t('updateTitle')}
            body={t('updateBody')}
            action={
              storeUrl
                ? { label: t('updateAction'), onPress: () => void openURL(storeUrl) }
                : undefined
            }
            secondary={{
              label: t('notNow'),
              onPress: () => {
                dismissUpdate();
                if (release?.minVersion) setNotNow(release.minVersion);
              },
            }}
          />
        </View>
      ) : null}
    </>
  );
}

function releaseOf(config: Config | undefined) {
  if (Platform.OS === 'ios') return config?.app.ios;
  if (Platform.OS === 'android') return config?.app.android;
  return undefined;
}
