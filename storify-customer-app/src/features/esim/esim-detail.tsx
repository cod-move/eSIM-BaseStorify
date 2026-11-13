import { setStringAsync } from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { openURL } from 'expo-linking';
import { useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { AppImage } from '@/components/ui/app-image';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import type { EsimDetail, EsimInstall } from '@/contracts/mobile/shop/v1/esim';
import { useErrorMessage } from '@/i18n/use-error-message';

import { CancelEsim } from './cancel-esim';
import { EsimStatus } from './esim-status';
import { UsageBar } from './usage-bar';
import { useRefreshEsim } from './use-esims';

/**
 * One eSIM (APP-03/04): its status and usage, how to put it on the phone, and
 * the plan's facts. Installing opens the system's own eSIM installer — an app
 * that is not the carrier's may not write an eSIM itself — and the QR code and
 * the codes are there for installing from another screen or by hand.
 */
export function EsimDetailView({ esim }: { esim: EsimDetail }) {
  const t = useTranslations('esim');
  const format = useFormatter();
  const tabBar = useTabBarHeight();
  const toast = useToast();
  const describe = useErrorMessage();
  const refresh = useRefreshEsim(esim.id);
  const router = useRouter();
  const date = (value: string | undefined) =>
    value ? format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short' }) : null;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 px-4 pt-3"
      contentContainerStyle={{ paddingBottom: tabBar + 16 }}>
      <View className="gap-3 rounded-xl bg-surface p-4">
        <View className="flex-row items-start gap-3">
          {esim.emoji ? <Text variant="heading">{esim.emoji}</Text> : null}
          <View className="flex-1 gap-0.5">
            <Text variant="title">{esim.planName}</Text>
            {esim.remark ? <Text variant="caption">{esim.remark}</Text> : null}
          </View>
        </View>
        <EsimStatus status={esim.status} tone={esim.tone} />
        {esim.usage ? (
          <View className="gap-1">
            <UsageBar usage={esim.usage} />
            {esim.usage.syncedAt ? (
              <Text variant="caption">
                {esim.usage.stale
                  ? t('syncedStale', { time: date(esim.usage.syncedAt) ?? '' })
                  : t('synced', { time: date(esim.usage.syncedAt) ?? '' })}
              </Text>
            ) : null}
          </View>
        ) : null}
        {esim.status !== 'issuing' && esim.status !== 'failed' && esim.status !== 'cancelled' ? (
          <Button
            label={t('refresh')}
            variant="outline"
            size="sm"
            icon="check"
            loading={refresh.isPending}
            onPress={() =>
              refresh.mutate(undefined, {
                onError: (error: unknown) => toast.show({ message: describe(error) }),
              })
            }
          />
        ) : null}
      </View>

      {esim.install ? <InstallCard install={esim.install} prominent={esim.canInstall} /> : null}

      {esim.canTopup ? (
        <Button
          label={t('topupButton')}
          variant="secondary"
          icon="plus"
          onPress={() =>
            router.push({ pathname: '/account/esims/[id]/topup', params: { id: esim.id } })
          }
        />
      ) : null}

      {esim.cancellation ? <CancelEsim id={esim.id} offer={esim.cancellation} /> : null}

      <View className="gap-2 rounded-xl bg-surface p-4">
        <Fact label={t('data')} value={esim.dataLabel} />
        <Fact label={t('validity')} value={t('days', { count: esim.validityDays })} />
        {esim.expiresAt ? <Fact label={t('expires')} value={date(esim.expiresAt)} /> : null}
        {esim.activationDeadline ? (
          <Fact label={t('installBefore')} value={date(esim.activationDeadline)} />
        ) : null}
        {esim.topupDeadline ? (
          <Fact label={t('topupBefore')} value={date(esim.topupDeadline)} />
        ) : null}
        {esim.iccid ? <Fact label={t('iccid')} value={esim.iccid} /> : null}
        {!esim.iccid && esim.simId ? <Fact label={t('simId')} value={esim.simId} /> : null}
        <Fact label={t('order')} value={esim.orderNumber} />
      </View>
    </ScrollView>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View className="flex-row justify-between gap-4">
      <Text className="text-muted">{label}</Text>
      <Text className="flex-1 text-end" selectable>
        {value}
      </Text>
    </View>
  );
}

/**
 * How to install: the system installer in one tap where the phone has one,
 * then the QR code, then the codes to type. `prominent` while the eSIM is
 * still waiting to be installed.
 */
function InstallCard({ install, prominent }: { install: EsimInstall; prominent: boolean }) {
  const t = useTranslations('esim');
  const toast = useToast();
  const [copied, setCopied] = useState<string | null>(null);
  const link =
    Platform.OS === 'ios'
      ? install.iosLink
      : Platform.OS === 'android'
        ? install.androidLink
        : undefined;
  const copy = (value: string) => {
    setStringAsync(value)
      .then(() => setCopied(value))
      .catch(() => undefined);
  };

  return (
    <View className="gap-4 rounded-xl bg-surface p-4">
      <Text variant="subheading">{t('installTitle')}</Text>
      {link ? (
        <View className="gap-1.5">
          <Button
            label={t('installNow')}
            variant={prominent ? 'primary' : 'secondary'}
            onPress={() => {
              openURL(link).catch(() => toast.show({ message: t('installUnavailable') }));
            }}
          />
          <Text variant="caption">{t('installNowHint')}</Text>
        </View>
      ) : null}
      <View className="items-center gap-2">
        <AppImage
          image={install.qrImage}
          size="full"
          className="size-56 rounded-lg bg-background"
          contentFit="contain"
        />
        <Text variant="caption" className="text-center">
          {t('scanHint')}
        </Text>
      </View>
      <View className="gap-3">
        {install.smdpAddress ? (
          <CodeRow
            label={t('smdp')}
            value={install.smdpAddress}
            copied={copied === install.smdpAddress}
            onCopy={copy}
          />
        ) : null}
        <CodeRow
          label={t('activationCode')}
          value={install.matchingId ?? install.activationCode}
          copied={copied === (install.matchingId ?? install.activationCode)}
          onCopy={copy}
        />
        {install.apn ? (
          <CodeRow
            label={t('apn')}
            value={install.apn}
            copied={copied === install.apn}
            onCopy={copy}
          />
        ) : null}
      </View>
    </View>
  );
}

function CodeRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: (value: string) => void;
}) {
  const t = useTranslations('esim');
  return (
    <View className="gap-1">
      <Text variant="caption">{label}</Text>
      <View className="flex-row items-center gap-2">
        <Text className="flex-1" selectable numberOfLines={2}>
          {value}
        </Text>
        <Button
          label={copied ? t('copied') : t('copy')}
          variant="outline"
          size="sm"
          icon="copy"
          accessibilityLabel={t('copyLabel', { what: label })}
          onPress={() => onCopy(value)}
        />
      </View>
    </View>
  );
}
