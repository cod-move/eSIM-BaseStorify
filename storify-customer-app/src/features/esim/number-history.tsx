import { useState } from 'react';
import { View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { Chip } from '@/components/ui/chip';
import { Icon, type IconName } from '@/components/ui/icon';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { Text } from '@/components/ui/text';
import {
  ESIM_NUMBER_HISTORY_DAYS,
  type EsimNumberDetail,
  type EsimNumberHistory,
} from '@/contracts/mobile/shop/v1/esim';

import { Asking } from './number-services-tab';
import { Panel } from './number-ui';
import { useEsimNumberHistory } from './use-numbers';

type List = 'calls' | 'data' | 'recharges' | 'voicemail';

/**
 * A number's usage (the website's Usage tab): calls and texts, data
 * sessions, credit added and voicemail messages of the last 7, 30 or 90
 * days, from the network's records, with totals.
 */
export function NumberHistoryTab({ number }: { number: EsimNumberDetail }) {
  const t = useTranslations('esim.history');
  const ts = useTranslations('esim.services');
  const [days, setDays] = useState<number>(30);
  const [list, setList] = useState<List>('calls');
  const history = useEsimNumberHistory(number.id, days);

  return (
    <Panel title={t('title')}>
      <View className="flex-row gap-2">
        {ESIM_NUMBER_HISTORY_DAYS.map((value) => (
          <Chip
            key={value}
            kind="filter"
            label={t('days', { count: value })}
            selected={value === days}
            onPress={() => setDays(value)}
          />
        ))}
      </View>
      {history.isPending ? (
        <Asking />
      ) : history.isError ? (
        <Text className="text-muted">{ts('unavailable')}</Text>
      ) : (
        <View className={history.isPlaceholderData ? 'gap-3 opacity-60' : 'gap-3'}>
          <View className="flex-row flex-wrap gap-2">
            <Total label={t('calls')} value={String(history.data.totals.calls)} />
            <Total label={t('texts')} value={String(history.data.totals.texts)} />
            <Total label={t('data')} value={history.data.totals.data} />
            <Total label={t('cost')} value={history.data.totals.cost.formatted} />
          </View>
          <SegmentedTabs<List>
            label={t('title')}
            value={list}
            onChange={setList}
            tabs={[
              { value: 'calls', label: t('callsTab') },
              { value: 'data', label: t('data') },
              { value: 'recharges', label: t('recharges') },
              { value: 'voicemail', label: t('voicemail') },
            ]}
          />
          <Entries history={history.data} list={list} />
          <Text variant="caption">{t('note')}</Text>
        </View>
      )}
    </Panel>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-[45%] flex-1 gap-0.5 rounded-lg border border-border p-2.5">
      <Text variant="caption">{label}</Text>
      <Text variant="label">{value}</Text>
    </View>
  );
}

function Entries({ history, list }: { history: EsimNumberHistory; list: List }) {
  const t = useTranslations('esim.history');
  const format = useFormatter();
  const when = (at: string | undefined) =>
    at ? format.dateTime(new Date(at), { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const party = (digits: string | undefined) => (digits ? `+${digits}` : '—');
  const items = {
    calls: history.calls,
    data: history.data,
    recharges: history.recharges,
    voicemail: history.voicemails,
  }[list];

  if (items === null) return <Text className="text-muted">{t('unavailable')}</Text>;
  if (items.length === 0) return <Text className="text-muted">{t('empty')}</Text>;

  if (list === 'calls' && history.calls) {
    return (
      <View className="gap-1">
        {history.calls.map((entry, index) => {
          const out = entry.direction === 'out';
          const title =
            entry.kind === 'voicemail'
              ? t('voicemailCall', { number: party(entry.party) })
              : entry.kind === 'sms'
                ? out
                  ? t('smsOut', { number: party(entry.party) })
                  : t('smsIn', { number: party(entry.party) })
                : out
                  ? t('callOut', { number: party(entry.party) })
                  : t('callIn', { number: party(entry.party) });
          const icon: IconName =
            entry.kind === 'call' ? 'phone' : entry.kind === 'sms' ? 'messages' : 'bell';
          return (
            <Row
              key={index}
              icon={icon}
              title={title}
              detail={[when(entry.at), entry.duration, entry.destination]
                .filter(Boolean)
                .join(' · ')}
              value={entry.cost?.formatted ?? '—'}
            />
          );
        })}
      </View>
    );
  }
  if (list === 'data' && history.data) {
    return (
      <View className="gap-1">
        {history.data.map((entry, index) => (
          <Row
            key={index}
            icon="globe"
            title={entry.network ?? '—'}
            detail={when(entry.at)}
            value={entry.traffic}
            sub={entry.cost?.formatted}
          />
        ))}
      </View>
    );
  }
  if (list === 'recharges' && history.recharges) {
    return (
      <View className="gap-1">
        {history.recharges.map((entry, index) => (
          <Row
            key={index}
            icon="wallet"
            title={
              entry.kind === 'voucher'
                ? t('rechargeVoucher')
                : entry.kind === 'automatic'
                  ? t('rechargeAutomatic')
                  : entry.out
                    ? t('rechargeOut')
                    : t('rechargeIn')
            }
            detail={when(entry.at)}
            value={entry.amount ? `${entry.out ? '' : '+'}${entry.amount.formatted}` : '—'}
          />
        ))}
      </View>
    );
  }
  return (
    <View className="gap-1">
      {(history.voicemails ?? []).map((entry) => (
        <Row
          key={entry.id}
          icon="bell"
          title={t('voicemailFrom', { number: party(entry.from) })}
          detail={when(entry.at)}
        />
      ))}
      <Text variant="caption">{t('voicemailListen')}</Text>
    </View>
  );
}

function Row({
  icon,
  title,
  detail,
  value,
  sub,
}: {
  icon: IconName;
  title: string;
  detail: string;
  value?: string;
  sub?: string;
}) {
  return (
    <View className="flex-row items-center gap-3 border-b border-border py-2.5">
      <Icon name={icon} size={16} colorClassName="accent-muted" />
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={1}>{title}</Text>
        <Text variant="caption" numberOfLines={1}>
          {detail}
        </Text>
      </View>
      {value ? (
        <View className="items-end">
          <Text>{value}</Text>
          {sub ? <Text variant="caption">{sub}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}
