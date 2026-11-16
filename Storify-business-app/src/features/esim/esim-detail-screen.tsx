import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { ActionRow, NavRow, RowGroup, ValueRow } from '@/components/ui/rows';
import { Screen, StackHeader } from '@/components/ui/screen';
import { ConfirmSheet } from '@/components/ui/sheet';
import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { StatusChip } from '@/components/ui/status-chip';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import type { EsimActionRequest, EsimDetail } from '@/contracts/mobile/biz/v1/esim';
import { useCan } from '@/features/workspace/use-workspace';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useDateTime } from '@/i18n/use-list-time';
import { usePullToRefresh } from '@/lib/use-pull-to-refresh';

import { bytesLabel, supplierName, toneOf } from './format';
import { useEsim, useEsimAccess, useEsimAction } from './use-esim';

/**
 * One eSIM, as an administrator answers a shopper about it: the card, who
 * bought it and in which order, the plan, data left and dates, each data
 * package, the fulfilment job while it says something, the latest supplier
 * calls; and, with Manage eSIM, refresh usage, resend the delivery email,
 * cancel it at the supplier.
 */
export function EsimDetailScreen({ id }: { id: string }) {
  const t = useTranslations('esim.detail');
  const query = useEsim(id);
  const pull = usePullToRefresh(query.refetch);
  const esim = query.data;
  const header = <StackHeader title={t('title')} icon="layers" />;

  if (!esim) {
    return (
      <Screen header={header}>
        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
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
      <Summary esim={esim} />
      <People esim={esim} />
      <Plan esim={esim} />
      <Packages esim={esim} />
      {esim.fulfilment ? <Fulfilment esim={esim} /> : null}
      <Actions esim={esim} />
      <Calls esim={esim} />
    </Screen>
  );
}

function Summary({ esim }: { esim: EsimDetail }) {
  const t = useTranslations('esim.detail');
  const left = bytesLabel(esim.remainingBytes);
  const total = bytesLabel(esim.totalBytes);
  return (
    <View className="gap-2 rounded-xl bg-surface p-4">
      <View className="flex-row items-start gap-2">
        <Text variant="title" accessibilityRole="header" className="flex-1">
          {esim.plan}
        </Text>
        <StatusChip tone={toneOf(esim.tone)} label={esim.statusLabel} />
      </View>
      {esim.iccid ? (
        <Text variant="meta" selectable>
          {t('iccid')} {esim.iccid}
        </Text>
      ) : esim.simId ? (
        <Text variant="meta" selectable>
          {t('simId')} {esim.simId}
        </Text>
      ) : null}
      {left && total ? (
        <Text variant="body">
          {t('remaining')}: {left} / {total}
        </Text>
      ) : null}
    </View>
  );
}

function People({ esim }: { esim: EsimDetail }) {
  const t = useTranslations('esim.detail');
  const canOrders = useCan('VIEW_ORDERS');
  const canCustomers = useCan('VIEW_ORDER_CUSTOMERS');
  const customer = [esim.customerName, esim.customerEmail].filter(Boolean).join(' · ');
  return (
    <RowGroup>
      {canOrders ? (
        <NavRow
          icon="receipt"
          title={t('order')}
          value={esim.orderNumber}
          onPress={() => router.push({ pathname: '/orders/[id]', params: { id: esim.orderId } })}
        />
      ) : (
        <ValueRow label={t('order')} value={esim.orderNumber} />
      )}
      {customer ? (
        canCustomers && esim.customerId ? (
          <NavRow
            icon="user"
            title={t('customer')}
            description={customer}
            onPress={() =>
              router.push(`/customers/${encodeURIComponent(esim.customerId!)}` as Href)
            }
          />
        ) : (
          <ValueRow label={t('customer')} value={customer} />
        )
      ) : null}
    </RowGroup>
  );
}

function Plan({ esim }: { esim: EsimDetail }) {
  const t = useTranslations('esim.detail');
  const when = useDateTime();
  const rows: [string, string | undefined][] = [
    [t('data'), esim.planData],
    [
      t('validity'),
      esim.validityDays ? t('validityDays', { count: esim.validityDays }) : undefined,
    ],
    [t('destination'), esim.destination],
    [t('supplier'), supplierName(esim.provider)],
    [t('supplierOrder'), esim.providerOrderId],
    [t('lifecycle'), esim.lifecycle],
    [
      t('installed'),
      esim.installed === undefined ? undefined : esim.installed ? t('yes') : t('no'),
    ],
    [t('issued'), esim.fulfilledAt ? when(esim.fulfilledAt) : undefined],
    [t('expires'), esim.expiresAt ? when(esim.expiresAt) : undefined],
    [t('topupDeadline'), esim.topupDeadline ? when(esim.topupDeadline) : undefined],
    [t('profileExpires'), esim.profileExpiresAt ? when(esim.profileExpiresAt) : undefined],
    [t('smdp'), esim.smdpAddress],
    [t('remark'), esim.remark],
  ];
  return (
    <RowGroup title={t('plan')}>
      {rows
        .filter((row): row is [string, string] => Boolean(row[1]))
        .map(([label, value]) => (
          <ValueRow key={label} label={label} value={value} />
        ))}
    </RowGroup>
  );
}

function Packages({ esim }: { esim: EsimDetail }) {
  const t = useTranslations('esim.detail');
  const when = useDateTime();
  if (!esim.packages.length) return null;
  return (
    <RowGroup title={t('packages')}>
      {esim.packages.map((pack, index) => {
        const kind = (['base', 'stack', 'addon'] as const).includes(pack.kind as 'base')
          ? t(`packageKinds.${pack.kind as 'base'}`)
          : pack.kind;
        const left = bytesLabel(pack.remainingBytes);
        const total = bytesLabel(pack.totalBytes);
        const lines = [
          left && total ? `${left} / ${total}` : total,
          t('validityDays', { count: pack.validityDays }),
          pack.expiresAt ? `${t('expires')} ${when(pack.expiresAt)}` : null,
        ].filter(Boolean);
        return (
          <View key={index} className="gap-0.5 px-4 py-3">
            <Text variant="label">{t('package', { kind, status: pack.status })}</Text>
            <Text variant="meta">{lines.join(' · ')}</Text>
          </View>
        );
      })}
    </RowGroup>
  );
}

function Fulfilment({ esim }: { esim: EsimDetail }) {
  const t = useTranslations('esim.detail');
  const job = esim.fulfilment!;
  return (
    <RowGroup title={t('fulfilment')}>
      <View className="gap-1 px-4 py-3">
        <Text variant="label">
          {t('fulfilmentState', { state: job.state, count: job.attempts })}
        </Text>
        {job.error ? (
          <Text variant="meta" className="text-danger">
            {job.error}
          </Text>
        ) : null}
      </View>
    </RowGroup>
  );
}

function Calls({ esim }: { esim: EsimDetail }) {
  const t = useTranslations('esim.detail');
  const when = useDateTime();
  if (!esim.calls.length) return null;
  return (
    <RowGroup title={t('calls')}>
      {esim.calls.slice(0, 10).map((call, index) => (
        <View key={index} className="gap-0.5 px-4 py-3">
          <View className="flex-row items-center gap-2">
            <Text variant="label" className="flex-1" numberOfLines={1}>
              {call.operation}
            </Text>
            <StatusChip
              tone={call.ok ? 'success' : 'danger'}
              label={call.ok ? t('callOk') : t('callFailed')}
            />
          </View>
          <Text variant="caption">
            {[when(call.at), call.durationMs !== undefined ? `${call.durationMs} ms` : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {call.error ? (
            <Text variant="meta" className="text-danger" numberOfLines={3}>
              {call.error}
            </Text>
          ) : null}
        </View>
      ))}
    </RowGroup>
  );
}

/** With Manage eSIM: refresh, resend, cancel (asked first). Each says how it went. */
function Actions({ esim }: { esim: EsimDetail }) {
  const t = useTranslations('esim.detail');
  const { manage } = useEsimAccess();
  const action = useEsimAction(esim.id);
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [confirm, setConfirm] = useState(false);
  if (!manage) return null;

  const run = async (request: EsimActionRequest) => {
    try {
      const result = await action.mutateAsync(request);
      setConfirm(false);
      const done =
        request.action === 'refresh'
          ? t('refreshed')
          : request.action === 'resend'
            ? result.ok
              ? t('resent')
              : t('notResent')
            : t('cancelled');
      toast.show({
        message: result.ok ? done : (result.message ?? done),
        tone: result.ok ? 'success' : 'danger',
      });
    } catch (error) {
      setConfirm(false);
      toast.show({ message: errorMessage(error), tone: 'danger' });
    }
  };

  return (
    <>
      <RowGroup title={t('actions')}>
        <ActionRow
          icon="refresh"
          title={t('refresh')}
          disabled={action.isPending}
          onPress={() => void run({ action: 'refresh' })}
        />
        <ActionRow
          icon="mail"
          title={t('resend')}
          disabled={action.isPending}
          onPress={() => void run({ action: 'resend' })}
        />
        <ActionRow
          icon="x-circle"
          title={t('cancel')}
          destructive
          disabled={action.isPending}
          onPress={() => setConfirm(true)}
        />
      </RowGroup>
      <ConfirmSheet
        visible={confirm}
        title={t('cancelTitle')}
        body={t('cancelBody')}
        confirmLabel={t('cancelConfirm')}
        cancelLabel={t('keep')}
        tone="danger"
        loading={action.isPending}
        onConfirm={() => void run({ action: 'cancel' })}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}
