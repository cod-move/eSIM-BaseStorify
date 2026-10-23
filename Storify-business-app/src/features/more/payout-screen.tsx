import * as Clipboard from 'expo-clipboard';
import { View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { Price } from '@/components/ui/price';
import { ActionRow, GroupFootnote, RowGroup, SectionLabel, ValueRow } from '@/components/ui/rows';
import { Screen, StackHeader } from '@/components/ui/screen';
import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import type { Money } from '@/contracts/mobile/biz/v1';
import { PayoutStatusChip, useStatusLabel } from '@/features/status/status-chip';
import { storeWord } from '@/features/status/status-tone';
import { useShortDate } from '@/i18n/use-list-time';
import { usePullToRefresh } from '@/lib/use-pull-to-refresh';

import { usePayout } from './use-payouts';

const METHODS = ['bank', 'cash', 'gateway', 'other'] as const;

/** An amount as a fact: the store's own text, and the same for a screen reader. */
function MoneyRow({ label, money }: { label: string; money: Money }) {
  return <ValueRow label={label} value={<Price money={money} />} valueLabel={money.formatted} />;
}

/**
 * One payout: what the seller receives, its status and
 * when it was paid; what it is made of; and its facts. Every amount is the
 * store's, as it formatted it.
 */
export function PayoutScreen({ id }: { id: string }) {
  const t = useTranslations('payouts.detail');
  const methods = useTranslations('payouts.methods');
  const titles = useTranslations('shell.titles');
  const time = useTranslations('time');
  const format = useFormatter();
  const date = useShortDate();
  const statusLabel = useStatusLabel();
  const toast = useToast();
  const query = usePayout(id);
  const pull = usePullToRefresh(query.refetch);
  const payout = query.data;
  const header = <StackHeader title={payout?.number ?? titles('payout')} />;

  if (!payout) {
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

  const when = payout.paidAt
    ? t('paidOn', { date: date(payout.paidAt) })
    : t('madeOn', { date: date(payout.createdAt) });
  const method = payout.method ? (METHODS.find((known) => known === payout.method) ?? null) : null;
  const reference = payout.reference;

  return (
    <Screen
      header={header}
      scroll
      refreshing={pull.refreshing}
      onRefresh={pull.onRefresh}
      contentClassName="gap-6 px-4 pt-2">
      <View
        accessible
        accessibilityLabel={[
          t('net'),
          payout.net.formatted,
          statusLabel('payout', payout.status),
          when,
        ].join(', ')}
        className="items-center gap-2 pt-2">
        <Text variant="meta">{t('net')}</Text>
        <Price money={payout.net} variant="price-large" />
        <PayoutStatusChip status={payout.status} className="self-center" />
        <Text variant="meta">{when}</Text>
      </View>

      <View>
        <SectionLabel title={t('breakdown')} />
        <RowGroup>
          <MoneyRow label={t('gross')} money={payout.gross} />
          <MoneyRow label={t('commission')} money={payout.commission} />
          {payout.shipping ? <MoneyRow label={t('shipping')} money={payout.shipping} /> : null}
          <MoneyRow label={t('adjustments')} money={payout.adjustments} />
          <MoneyRow label={t('net')} money={payout.net} />
        </RowGroup>
        <GroupFootnote text={t('inside')} />
      </View>

      <View>
        <SectionLabel title={t('details')} />
        <RowGroup>
          <ValueRow
            label={t('period')}
            value={time('range', {
              start: date(payout.periodStart),
              end: date(payout.periodEnd),
            })}
          />
          <ValueRow label={t('orders')} value={format.number(payout.orderCount)} />
          {payout.method ? (
            <ValueRow
              label={t('method')}
              value={method ? methods(method) : storeWord(payout.method)}
            />
          ) : null}
          {reference ? <ValueRow label={t('reference')} value={reference} /> : null}
          {reference ? (
            <ActionRow
              icon="copy"
              title={t('copyReference')}
              onPress={() =>
                void Clipboard.setStringAsync(reference).then(() =>
                  toast.show({ message: t('referenceCopied'), tone: 'success' })
                )
              }
            />
          ) : null}
        </RowGroup>
      </View>
    </Screen>
  );
}
