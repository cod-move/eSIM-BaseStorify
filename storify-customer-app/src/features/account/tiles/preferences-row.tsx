import { useRouter } from 'expo-router';
import type { ReactElement } from 'react';
import { useTranslations } from 'use-intl';

import { NavRow } from '@/components/ui/rows';

/**
 * The Preferences row under Profile, to `/account/preferences`. A hook rather
 * than a component, because `RowGroup` draws a divider before every element it
 * is given, even one that draws nothing.
 */
export function usePreferencesRow(): ReactElement | null {
  const t = useTranslations('preferences');
  const router = useRouter();

  return (
    <NavRow icon="filter" title={t('title')} onPress={() => router.push('/account/preferences')} />
  );
}
