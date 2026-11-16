import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { RadioRow, RowGroup } from '@/components/ui/rows';
import { Screen, StackHeader } from '@/components/ui/screen';
import { SearchField } from '@/components/ui/search-field';
import { ConfirmSheet } from '@/components/ui/sheet';
import { StatusChip } from '@/components/ui/status-chip';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import {
  PROBLEM_VIEWS,
  type ProblemActionRequest,
  type ProblemRow,
  type ProblemView,
} from '@/contracts/mobile/biz/v1/esim';
import { useCan } from '@/features/workspace/use-workspace';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useDateTime } from '@/i18n/use-list-time';
import { useDebouncedValue } from '@/lib/use-debounced-value';

import { stateTone, supplierName } from './format';
import { PagedList } from './paged-list';
import { useEsimAccess, useProblemAction, useProblems } from './use-esim';

/**
 * Orders whose eSIM needs a person, as the website's eSIM → Problems: held
 * for review, waiting for a supplier top-up, failed with a refund still open,
 * or stuck. With Manage eSIM each one can be tried again (or with another
 * supplier), given up, marked refunded, approved or rejected.
 */
export function ProblemsScreen() {
  const t = useTranslations('esim.problems');
  const [view, setView] = useState<ProblemView>('attention');
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim());
  const list = useProblems(view, term);
  const counts = list.data?.counts;

  return (
    <Screen header={<StackHeader title={t('title')} icon="alert-circle" />}>
      <View className="gap-3 px-4 pb-3">
        <SearchField label={t('search')} value={search} onChangeText={setSearch} />
        <FilterTabs
          label={t('title')}
          tabs={PROBLEM_VIEWS.map((value) => ({
            value,
            label: t(`views.${value}`),
            count: counts && value !== 'all' ? counts[value] : undefined,
          }))}
          value={view}
          onChange={setView}
        />
      </View>
      <PagedList
        query={list}
        renderItem={(problem) => <ProblemCard problem={problem} />}
        empty={{ icon: 'check-circle', title: t('emptyTitle'), body: t('emptyBody') }}
      />
    </Screen>
  );
}

type Dialogue = 'switch' | 'fail' | 'refunded' | 'approve' | 'reject' | null;

function ProblemCard({ problem }: { problem: ProblemRow }) {
  const t = useTranslations('esim.problems');
  const when = useDateTime();
  const canOrders = useCan('VIEW_ORDERS');
  const { manage } = useEsimAccess();
  const action = useProblemAction(problem.id);
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [dialogue, setDialogue] = useState<Dialogue>(null);
  const [candidate, setCandidate] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const known = [
    'queued',
    'purchasing',
    'provider_pending',
    'review',
    'failed',
    'delivered',
    'fulfilled',
  ] as const;
  const stateLabel = (known as readonly string[]).includes(problem.state)
    ? t(`states.${problem.state as (typeof known)[number]}`)
    : problem.state;

  const reviewing = problem.state === 'review';
  const failed = problem.state === 'failed';
  const working = ['queued', 'purchasing', 'provider_pending'].includes(problem.state);
  const refundOpen = failed && (!problem.refund || problem.refund.state === 'manual');
  const others = problem.suppliers.filter((supplier) => supplier.provider !== problem.supplier);

  const run = async (request: ProblemActionRequest) => {
    try {
      await action.mutateAsync(request);
      setDialogue(null);
      toast.show({ message: t(`done.${request.action}`), tone: 'success' });
    } catch (error) {
      setDialogue(null);
      toast.show({ message: errorMessage(error), tone: 'danger' });
    }
  };

  const refund = problem.refund
    ? problem.refund.state === 'done'
      ? t('refundDone', { amount: problem.refund.amount.toFixed(2) })
      : problem.refund.state === 'manual'
        ? t('refundManual', { amount: problem.refund.amount.toFixed(2) })
        : t('refundPending')
    : null;

  const sheet = (() => {
    switch (dialogue) {
      case 'fail':
        return {
          title: t('failTitle'),
          body: t('failBody'),
          confirm: () => run({ action: 'fail' }),
          danger: true,
        };
      case 'approve':
        return {
          title: t('approveTitle'),
          body: t('approveBody'),
          confirm: () => run({ action: 'approve' }),
          danger: false,
        };
      case 'reject':
        return {
          title: t('rejectTitle'),
          body: t('rejectBody'),
          confirm: () => run({ action: 'reject' }),
          danger: true,
        };
      case 'refunded':
        return {
          title: t('refundedTitle'),
          body: t('refundedBody'),
          confirm: () => run({ action: 'refunded', note: note.trim() || undefined }),
          danger: false,
        };
      case 'switch':
        return {
          title: t('switchTitle'),
          body: t('switchBody'),
          confirm: () =>
            candidate === null ? undefined : run({ action: 'switch', candidateIndex: candidate }),
          danger: false,
        };
      default:
        return null;
    }
  })();

  return (
    <View className="gap-2 rounded-[20px] border border-transparent bg-surface p-3 dark:border-border">
      <View className="flex-row items-start gap-2">
        <View className="flex-1 gap-0.5">
          <Text variant="label" numberOfLines={2}>
            {problem.unit}
          </Text>
          <Text variant="meta" selectable>
            {[problem.orderNumber, problem.customerEmail].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <StatusChip tone={stateTone(problem.state)} label={stateLabel} />
      </View>

      <Text variant="caption">
        {[
          t('attempts', { count: problem.attempts }),
          problem.supplier ? t('supplier', { name: supplierName(problem.supplier) }) : null,
          when(problem.createdAt),
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {problem.error ? (
        <Text variant="meta" className="text-danger" numberOfLines={4}>
          {problem.error.code}: {problem.error.message}
        </Text>
      ) : null}
      {problem.balanceHoldUntil ? (
        <Text variant="meta">{t('balanceHold', { date: when(problem.balanceHoldUntil) })}</Text>
      ) : null}
      {problem.nextAttemptAt && working ? (
        <Text variant="meta">{t('nextAttempt', { date: when(problem.nextAttemptAt) })}</Text>
      ) : null}
      {refund ? <Text variant="meta">{refund}</Text> : null}
      {problem.reviewReasons.length ? (
        <Text variant="meta">
          {t('review')}: {problem.reviewReasons.join('; ')}
        </Text>
      ) : null}

      <View className="flex-row flex-wrap gap-2 pt-1">
        {canOrders ? (
          <Button
            size="sm"
            variant="secondary"
            label={t('openOrder')}
            onPress={() =>
              router.push({ pathname: '/orders/[id]', params: { id: problem.orderId } })
            }
          />
        ) : null}
        {manage && reviewing ? (
          <>
            <Button
              size="sm"
              label={t('approve')}
              disabled={action.isPending}
              onPress={() => setDialogue('approve')}
            />
            <Button
              size="sm"
              variant="secondary"
              label={t('reject')}
              disabled={action.isPending}
              onPress={() => setDialogue('reject')}
            />
          </>
        ) : null}
        {manage && (working || failed) ? (
          <Button
            size="sm"
            label={t('retry')}
            loading={action.isPending && !dialogue}
            onPress={() => void run({ action: 'retry' })}
          />
        ) : null}
        {manage && (working || failed) && others.length ? (
          <Button
            size="sm"
            variant="secondary"
            label={t('switch')}
            disabled={action.isPending}
            onPress={() => {
              setCandidate(others[0]?.index ?? null);
              setDialogue('switch');
            }}
          />
        ) : null}
        {manage && working ? (
          <Button
            size="sm"
            variant="secondary"
            destructive
            label={t('fail')}
            disabled={action.isPending}
            onPress={() => setDialogue('fail')}
          />
        ) : null}
        {manage && refundOpen ? (
          <Button
            size="sm"
            variant="secondary"
            label={t('refunded')}
            disabled={action.isPending}
            onPress={() => setDialogue('refunded')}
          />
        ) : null}
      </View>

      {sheet ? (
        <ConfirmSheet
          visible
          title={sheet.title}
          body={sheet.body}
          confirmLabel={t('confirm')}
          cancelLabel={t('back')}
          tone={sheet.danger ? 'danger' : 'accent'}
          loading={action.isPending}
          confirmDisabled={dialogue === 'switch' && candidate === null}
          onConfirm={() => void sheet.confirm()}
          onCancel={() => setDialogue(null)}>
          {dialogue === 'switch' ? (
            <RowGroup bare>
              {others.map((supplier) => (
                <RadioRow
                  key={supplier.index}
                  title={supplierName(supplier.provider)}
                  description={supplier.name}
                  selected={candidate === supplier.index}
                  onSelect={() => setCandidate(supplier.index)}
                />
              ))}
            </RowGroup>
          ) : dialogue === 'refunded' ? (
            <TextField
              label={t('refundNote')}
              value={note}
              onChangeText={setNote}
              maxLength={200}
              optional
            />
          ) : null}
        </ConfirmSheet>
      ) : null}
    </View>
  );
}
