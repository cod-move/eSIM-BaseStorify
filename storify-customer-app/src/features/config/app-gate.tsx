import * as SplashScreen from 'expo-splash-screen';
import { useEffect, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import { useTranslations } from 'use-intl';

import { useGate } from '@/api/gate';
import type { Config } from '@/contracts/mobile/shop/v1';
import { appInfo } from '@/lib/device';
import { compareVersions } from '@/lib/version';
import { useThemeSync } from '@/theme/use-theme';

import { GateScreen, UpdatePrompt } from './gate-screen';
import { useConfig } from './use-config';
import { useLocaleSync } from './use-locale-sync';

/**
 * Stands between the providers and the screens. It loads the store's settings,
 * applies the store's theme and language, and decides whether the app may open
 * at all: not while the store is closed for maintenance or cannot be reached.
 * A version the store no longer supports opens, with a prompt to update.
 *
 * The native splash screen stays up until there is something to show: the app
 * (from the settings kept on the device, so at once on every start but the
 * first), or one of the two screens below.
 */
export function AppGate({ children }: PropsWithChildren) {
  const t = useTranslations('gate');
  const tCommon = useTranslations('common');
  const config = useConfig();
  const updateRequired = useGate((gate) => gate.updateRequired);
  const maintenance = useGate((gate) => gate.maintenance);
  const clearMaintenance = useGate((gate) => gate.clearMaintenance);
  const requireUpdate = useGate((gate) => gate.requireUpdate);
  const dismissUpdate = useGate((gate) => gate.dismissUpdate);

  useThemeSync(config.data);
  useLocaleSync(config.data, config.error);

  const settled = config.data !== undefined || config.isError;
  useEffect(() => {
    if (settled) SplashScreen.hide();
  }, [settled]);

  const retry = () => {
    clearMaintenance();
    void config.refetch();
  };

  const release = releaseOf(config.data);
  const tooOld =
    release?.minVersion !== undefined && compareVersions(appInfo.version, release.minVersion) < 0;

  // Below the store's minimum the app still browses: it asks once at start, and
  // again whenever the store refuses a change (426).
  useEffect(() => {
    if (tooOld) requireUpdate();
  }, [tooOld, requireUpdate]);

  if (maintenance) {
    return (
      <GateScreen
        title={maintenance.title || t('maintenanceTitle')}
        body={maintenance.message || t('maintenanceBody')}
        actionLabel={tCommon('retry')}
        onAction={retry}
      />
    );
  }

  if (!config.data) {
    // Still loading: the splash screen is showing.
    if (!config.isError) return null;
    return (
      <GateScreen
        title={t('unavailableTitle')}
        body={t('unavailableBody')}
        actionLabel={tCommon('retry')}
        onAction={retry}
      />
    );
  }

  return (
    <>
      {children}
      <UpdatePrompt
        visible={updateRequired}
        storeUrl={release?.storeUrl}
        onDismiss={dismissUpdate}
      />
    </>
  );
}

function releaseOf(config: Config | undefined) {
  if (Platform.OS === 'ios') return config?.app.ios;
  if (Platform.OS === 'android') return config?.app.android;
  return undefined;
}
