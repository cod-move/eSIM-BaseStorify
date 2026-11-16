import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { RowGroup, ValueRow } from '@/components/ui/rows';
import { Screen, StackHeader } from '@/components/ui/screen';
import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { StatusChip } from '@/components/ui/status-chip';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import type { EsimJob, EsimSupplier } from '@/contracts/mobile/biz/v1/esim';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useListTime } from '@/i18n/use-list-time';
import { usePullToRefresh } from '@/lib/use-pull-to-refresh';

import { useEsimAccess, useEsimStatus, useRunJob } from './use-esim';

/**
 * Whether the eSIM machinery runs: how many orders and top-ups wait for a
 * person, each scheduled job (and, with Manage eSIM, running one now), and
 * each supplier's catalogue sync and connection check.
 */
export function StatusScreen() {
  const t = useTranslations('esim.status');
  const status = useEsimStatus();
  const pull = usePullToRefresh(status.refetch);
  const header = <StackHeader title={t('title')} icon="clock" />;
  const data = status.data;

  if (!data) {
    return (
      <Screen header={header}>
        {status.isError ? (
          <ErrorState error={status.error} onRetry={() => void status.refetch()} />
        ) : (
          <LoadingState shape="spinner" />
        )}
      </Screen>
    );
  }

  return (
    <Screen
      header={header}
      scroll
      refreshing={pull.refreshing}
      onRefresh={pull.onRefresh}
      contentClassName="gap-4 px-4 pt-2">
      <RowGroup>
        <ValueRow label={t('problems')} value={String(data.problems.attention)} />
        <ValueRow label={t('topupProblems')} value={String(data.topupProblems)} />
      </RowGroup>
      <RowGroup title={t('jobs')}>
        {data.jobs.map((job) => (
          <JobRow key={job.job} job={job} />
        ))}
      </RowGroup>
      {data.suppliers.length ? (
        <RowGroup title={t('suppliers')}>
          {data.suppliers.map((supplier) => (
            <SupplierRow key={supplier.code} supplier={supplier} />
          ))}
        </RowGroup>
      ) : null}
    </Screen>
  );
}

function JobRow({ job }: { job: EsimJob }) {
  const t = useTranslations('esim.status');
  const time = useListTime();
  const { manage } = useEsimAccess();
  const run = useRunJob();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const failing = job.consecutiveFailures > 0;
  const tone = job.stale ? 'danger' : failing ? 'warning' : 'success';
  const label = job.stale
    ? t('jobStale')
    : failing
      ? t('jobFailing', { count: job.consecutiveFailures })
      : job.lastRunAt
        ? t('jobOk', { date: time(job.lastRunAt) })
        : t('jobNever');

  return (
    <View className="gap-1.5 px-4 py-3">
      <View className="flex-row items-center gap-2">
        <Text variant="label" className="flex-1" numberOfLines={1}>
          {job.job}
        </Text>
        <StatusChip tone={tone} label={label} />
      </View>
      <Text variant="caption">
        {[job.schedule, job.lastRunAt ? time(job.lastRunAt) : null].filter(Boolean).join(' · ')}
      </Text>
      {job.lastError ? (
        <Text variant="meta" className="text-danger" numberOfLines={3}>
          {job.lastError}
        </Text>
      ) : null}
      {manage ? (
        <View className="flex-row pt-1">
          <Button
            size="sm"
            variant="secondary"
            icon="refresh"
            label={t('runNow')}
            loading={run.isPending && run.variables === job.job}
            disabled={run.isPending}
            onPress={() =>
              run.mutate(job.job, {
                onSuccess: () => toast.show({ message: t('runStarted'), tone: 'success' }),
                onError: (error) => toast.show({ message: errorMessage(error), tone: 'danger' }),
              })
            }
          />
        </View>
      ) : null}
    </View>
  );
}

function SupplierRow({ supplier }: { supplier: EsimSupplier }) {
  const t = useTranslations('esim.status');
  const time = useListTime();
  const syncFailed = supplier.lastSyncStatus === 'failed';
  const probeFailed = supplier.lastProbeOk === false;
  const tone = !supplier.active ? 'neutral' : syncFailed || probeFailed ? 'warning' : 'success';
  const chip = !supplier.active
    ? t('supplierOff')
    : syncFailed
      ? t('syncFailed')
      : probeFailed
        ? t('probeFailed')
        : t('supplierPlans', { count: supplier.plansAvailable });

  return (
    <View className="gap-1 px-4 py-3">
      <View className="flex-row items-center gap-2">
        <Text variant="label" className="flex-1" numberOfLines={1}>
          {supplier.name}
        </Text>
        <StatusChip tone={tone} label={chip} />
      </View>
      {supplier.lastSyncAt ? (
        <Text variant="caption">{t('lastSync', { date: time(supplier.lastSyncAt) })}</Text>
      ) : null}
      {syncFailed && supplier.lastSyncError ? (
        <Text variant="meta" className="text-danger" numberOfLines={3}>
          {supplier.lastSyncError}
        </Text>
      ) : null}
      {probeFailed && supplier.lastProbeMessage ? (
        <Text variant="meta" className="text-danger" numberOfLines={3}>
          {supplier.lastProbeMessage}
        </Text>
      ) : null}
    </View>
  );
}
