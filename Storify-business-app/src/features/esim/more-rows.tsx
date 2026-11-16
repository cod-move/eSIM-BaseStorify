import { router, type Href } from 'expo-router';
import { useTranslations } from 'use-intl';

import { NavRow, RowGroup } from '@/components/ui/rows';
import { StatusChip } from '@/components/ui/status-chip';

import { useEsimAccess, useEsimStatus } from './use-esim';

/**
 * The eSIM area's way in, on the Account tab (patch P77): only for an
 * administrator with the eSIM permissions, with how many orders wait for a
 * person.
 */
export function EsimMoreRows() {
  const t = useTranslations('esim');
  const { view } = useEsimAccess();
  if (!view) return null;
  return (
    <RowGroup>
      <EsimRow label={t('moreTitle')} hint={t('moreHint')} />
    </RowGroup>
  );
}

function EsimRow({ label, hint }: { label: string; hint: string }) {
  const t = useTranslations('esim');
  const attention = useEsimStatus().data?.problems.attention ?? 0;
  return (
    <NavRow
      icon="layers"
      title={label}
      description={hint}
      trailing={
        attention ? (
          <StatusChip tone="danger" label={t('attention', { count: attention })} />
        ) : undefined
      }
      onPress={() => router.push('/esim' as Href)}
    />
  );
}
