import { useTranslations } from 'use-intl';

import { Banner } from '@/components/ui/banner';

import { usePushPermission } from './use-push-permission';

/**
 * Push is off on this phone: "Turn on" asks while the
 * phone still can; once it has refused, "Open settings" opens the app's page
 * in the phone's settings. Nothing where push is allowed or does not exist.
 */
export function PushOffBanner({ className }: { className?: string }) {
  const t = useTranslations('push.off');
  const { state, request, openSettings } = usePushPermission();

  if (state === 'undetermined') {
    return (
      <Banner
        tone="info"
        icon="bell-off"
        message={t('ask')}
        action={{ label: t('turnOn'), onPress: () => void request() }}
        className={className}
      />
    );
  }
  if (state === 'denied') {
    return (
      <Banner
        tone="warning"
        icon="bell-off"
        message={t('denied')}
        action={{ label: t('openSettings'), onPress: openSettings }}
        className={className}
      />
    );
  }
  return null;
}
