import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { EsimNumberDetail } from '@/contracts/mobile/shop/v1/esim';

import { NumberBalanceTab } from './number-balance';
import { NumberDiagnoseTab } from './number-diagnose';
import { NumberHistoryTab } from './number-history';
import { NumberInstallTab } from './number-install';
import { NumberManageTab } from './number-manage';
import { NumberServicesTab } from './number-services-tab';
import { Pill } from './number-ui';

type Tab = 'balance' | 'install' | 'services' | 'usage' | 'diagnose' | 'manage';

/**
 * One of the shopper's numbers (NUM-06~09), the website's number page: its
 * balance, state and packages, then a tab each for installing it, its
 * services, its usage, diagnosing it and managing it. A tab that asks the
 * network does so only while it is open.
 */
export function NumberDetailView({ number }: { number: EsimNumberDetail }) {
  const t = useTranslations('esim.number');
  const format = useFormatter();
  const tabBar = useTabBarHeight();
  const [tab, setTab] = useState<Tab>('balance');
  const date = (value: string | undefined) =>
    value ? format.dateTime(new Date(value), { dateStyle: 'medium' }) : '—';

  const tabs: { value: Tab; label: string }[] = [
    { value: 'balance', label: t('tabBalance') },
    ...(number.install ? [{ value: 'install' as const, label: t('tabInstall') }] : []),
    { value: 'services', label: t('tabServices') },
    { value: 'usage', label: t('tabUsage') },
    { value: 'diagnose', label: t('tabDiagnose') },
    { value: 'manage', label: t('tabManage') },
  ];

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 px-4 pt-3"
      contentContainerStyle={{ paddingBottom: tabBar + 16 }}
      keyboardShouldPersistTaps="handled">
      <View className="gap-2">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text variant="heading" className="font-mono" selectable>
            {number.display}
          </Text>
          <Pill
            label={number.blocked ? t('blocked') : t('active')}
            danger={number.blocked === true}
          />
        </View>
        {number.remark ? <Text variant="caption">{number.remark}</Text> : null}
      </View>

      <View className="flex-row gap-2">
        <Stat label={t('balanceLabel')} value={number.balance?.formatted ?? '—'} />
        <Stat label={t('lastUsed')} value={date(number.lastUsedAt)} />
        <Stat label={t('validUntil')} value={date(number.validUntil)} />
      </View>

      {number.pending.length ? (
        <View className="flex-row items-start gap-2 rounded-xl border border-warning p-3">
          <Icon name="warning" size={18} colorClassName="accent-warning" />
          <Text className="flex-1">{t('pending', { items: number.pending.join(', ') })}</Text>
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
        accessibilityRole="tablist">
        {tabs.map((entry) => (
          <Chip
            key={entry.value}
            kind="filter"
            label={entry.label}
            selected={tab === entry.value}
            accessibilityRole="tab"
            onPress={() => setTab(entry.value)}
          />
        ))}
      </ScrollView>

      {tab === 'balance' ? <NumberBalanceTab number={number} /> : null}
      {tab === 'install' && number.install ? <NumberInstallTab install={number.install} /> : null}
      {tab === 'services' ? <NumberServicesTab number={number} /> : null}
      {tab === 'usage' ? <NumberHistoryTab number={number} /> : null}
      {tab === 'diagnose' ? <NumberDiagnoseTab number={number} /> : null}
      {tab === 'manage' ? <NumberManageTab number={number} /> : null}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 gap-0.5 rounded-xl bg-surface p-3">
      <Text variant="caption" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="label" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}
