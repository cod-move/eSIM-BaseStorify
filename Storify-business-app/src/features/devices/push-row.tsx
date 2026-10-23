import { useTranslations } from 'use-intl';

import { NavRow } from '@/components/ui/rows';

import { usePushPermission } from './use-push-permission';

/**
 * Notifications on this phone, "On" or "Off". Off, it
 * asks while the phone still can; otherwise it opens the app's page in the
 * phone's settings, where they are turned on or off. Nothing where push does
 * not exist (the browser preview).
 */
export function PushRow() {
  const t = useTranslations('more.push');
  const { state, request, openSettings } = usePushPermission();
  if (state === 'unsupported') return null;

  return (
    <NavRow
      icon={state === 'granted' ? 'bell' : 'bell-off'}
      title={t('title')}
      value={state === 'granted' ? t('on') : state === 'unknown' ? undefined : t('off')}
      onPress={() => (state === 'undetermined' ? void request() : openSettings())}
    />
  );
}
