import { router } from 'expo-router';
import { useTranslations } from 'use-intl';

import { Banner } from '@/components/ui/banner';
import { useMe } from '@/features/workspace/use-me';

/**
 * Two-step verification is off: an `info` banner on the
 * Account tab with "Set up", until it is on. People who run a store hold its
 * orders, customers and money behind one password.
 */
export function TwoStepNudge({ className }: { className?: string }) {
  const t = useTranslations('more.twoStepNudge');
  const me = useMe();
  if (!me.data || me.data.twoFactorEnabled) return null;

  return (
    <Banner
      tone="info"
      icon="shield"
      title={t('title')}
      message={t('body')}
      action={{ label: t('action'), onPress: () => router.push('/more/account/two-step') }}
      className={className}
    />
  );
}
