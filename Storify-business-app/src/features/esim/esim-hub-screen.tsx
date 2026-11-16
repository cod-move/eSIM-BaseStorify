import { router, type Href } from 'expo-router';
import { useTranslations } from 'use-intl';

import { GroupFootnote, NavRow, RowGroup } from '@/components/ui/rows';
import { Screen, StackHeader } from '@/components/ui/screen';
import { StatusChip } from '@/components/ui/status-chip';
import { usePullToRefresh } from '@/lib/use-pull-to-refresh';

import { useEsimStatus } from './use-esim';

/**
 * The eSIM area's start: what needs a person (failed or stuck orders,
 * top-ups, a scheduled job that stopped), then the area's lists.
 */
export function EsimHubScreen() {
  const t = useTranslations('esim');
  const status = useEsimStatus();
  const pull = usePullToRefresh(status.refetch);
  const data = status.data;
  const attention = data?.problems.attention ?? 0;
  const topups = data?.topupProblems ?? 0;
  const jobsDown = data?.jobs.filter((job) => job.stale || job.consecutiveFailures > 0).length ?? 0;
  const go = (href: string) => router.push(href as Href);

  return (
    <Screen
      header={<StackHeader title={t('title')} icon="layers" />}
      scroll
      refreshing={pull.refreshing}
      onRefresh={pull.onRefresh}
      contentClassName="gap-4 px-4 pt-2">
      <RowGroup>
        <NavRow
          icon="alert-circle"
          title={t('hub.problems')}
          description={t('hub.problemsHint')}
          trailing={
            data ? (
              <StatusChip
                tone={attention ? 'danger' : 'success'}
                label={attention ? t('attention', { count: attention }) : t('allGood')}
              />
            ) : undefined
          }
          onPress={() => go('/esim/problems')}
        />
        <NavRow
          icon="search"
          title={t('hub.esims')}
          description={t('hub.esimsHint')}
          onPress={() => go('/esim/esims')}
        />
        <NavRow
          icon="refresh"
          title={t('hub.topups')}
          description={t('hub.topupsHint')}
          trailing={
            topups ? (
              <StatusChip tone="danger" label={t('attention', { count: topups })} />
            ) : undefined
          }
          onPress={() => go('/esim/topups')}
        />
        <NavRow
          icon="phone"
          title={t('hub.numbers')}
          description={t('hub.numbersHint')}
          onPress={() => go('/esim/numbers')}
        />
        <NavRow
          icon="clock"
          title={t('hub.status')}
          description={t('hub.statusHint')}
          trailing={
            jobsDown ? (
              <StatusChip tone="warning" label={t('attention', { count: jobsDown })} />
            ) : undefined
          }
          onPress={() => go('/esim/status')}
        />
      </RowGroup>
      <GroupFootnote text={t('hub.website')} />
    </Screen>
  );
}
