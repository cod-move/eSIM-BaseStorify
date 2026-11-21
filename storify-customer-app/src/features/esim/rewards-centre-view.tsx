import { openURL } from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { isApiError } from '@/api/errors';
import { useTabBarHeight } from '@/components/shell/tab-bar';
import { Button } from '@/components/ui/button';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { Sheet } from '@/components/ui/sheet';
import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import type { EsimReferrals, EsimRewards } from '@/contracts/mobile/shop/v1/esim';
import { useErrorMessage } from '@/i18n/use-error-message';

import { ReferralsContent } from './referrals-view';
import {
  useEsimReferrals,
  useLinkEsimTelegram,
  useEsimRewardsHistory,
  useRedeemEsimReward,
  useUnlinkEsimTelegram,
} from './use-account';

export type RewardsTab = 'checkin' | 'invite' | 'received';

const REDEEM_REFUSALS = {
  DISABLED: 'rewardsClosed',
  NO_ITEM: 'redeemGone',
  NOT_ENOUGH: 'redeemShort',
  FAILED: 'redeemFailed',
} as const;

const requestId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

/**
 * The rewards centre (福利中心, the website's /account/esims/rewards): the
 * data balance; three tabs — invite friends, check in on Telegram, data
 * received for joining; then the eSIMs the data buys and every entry.
 */
export function RewardsCentreView({
  rewards,
  initialTab = 'invite',
}: {
  rewards: EsimRewards;
  initialTab?: RewardsTab;
}) {
  const t = useTranslations('esim');
  const tabBar = useTabBarHeight();
  const [tab, setTab] = useState<RewardsTab>(initialTab);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 px-4 pt-3"
      contentContainerStyle={{ paddingBottom: tabBar + 16 }}
      keyboardShouldPersistTaps="handled">
      <View className="gap-1 rounded-xl bg-surface p-4">
        <Text variant="caption">{t('rewardsBalance')}</Text>
        <Text variant="price">{rewards.balance.formatted}</Text>
        <Text variant="caption">
          {t('rewardsTotals', { earned: rewards.earned.formatted, spent: rewards.spent.formatted })}
        </Text>
      </View>

      <SegmentedTabs<RewardsTab>
        label={t('rewardsCentre')}
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'invite', label: t('rewardsTabInvite') },
          { value: 'checkin', label: t('rewardsTabCheckin') },
          { value: 'received', label: t('rewardsTabReceived') },
        ]}
      />

      {tab === 'checkin' ? <CheckinTab rewards={rewards} /> : <ReferralTab tab={tab} />}

      <ExchangeCard rewards={rewards} />
      <HistoryCard rewards={rewards} />
    </ScrollView>
  );
}

function CheckinTab({ rewards }: { rewards: EsimRewards }) {
  const t = useTranslations('esim');
  const toast = useToast();
  const describe = useErrorMessage();
  const link = useLinkEsimTelegram();
  const unlink = useUnlinkEsimTelegram();
  const { telegram } = rewards;
  const linkedName = telegram.linked?.username
    ? `@${telegram.linked.username}`
    : (telegram.linked?.name ?? 'Telegram');

  return (
    <View className="gap-3 rounded-xl bg-surface p-4">
      <Text variant="subheading">Telegram</Text>
      <Text variant="caption">{t('rewardsCheckinHow')}</Text>
      {!rewards.enabled ? <Text className="text-muted">{t('rewardsClosed')}</Text> : null}
      {rewards.checkinLimit ? <LimitNotice limit={rewards.checkinLimit} /> : null}
      <Text variant="caption">{t('rewardsCheckins', { count: rewards.checkins })}</Text>
      {telegram.linked ? (
        <>
          <Text>{t('rewardsLinkedAs', { name: linkedName })}</Text>
          {telegram.groupLink ? (
            <Button
              label={t('rewardsOpenGroup')}
              icon="chat"
              onPress={() => openURL(telegram.groupLink!).catch(() => undefined)}
            />
          ) : null}
          <Button
            label={t('rewardsUnlink')}
            variant="secondary"
            loading={unlink.isPending}
            onPress={() =>
              unlink.mutate(undefined, {
                onError: (error: unknown) => toast.show({ message: describe(error) }),
              })
            }
          />
        </>
      ) : (
        <>
          <Text className="text-muted">{t('rewardsNotLinked')}</Text>
          <Button
            label={t('rewardsLink')}
            icon="chat"
            disabled={!telegram.bot}
            loading={link.isPending}
            onPress={() =>
              link.mutate(undefined, {
                onSuccess: ({ url }) => {
                  openURL(url).catch(() => toast.show({ message: t('rewardsNoTelegram') }));
                },
                onError: (error: unknown) => toast.show({ message: describe(error) }),
              })
            }
          />
          {telegram.bot ? (
            <Text variant="caption">{t('rewardsLinkByEmail', { bot: `@${telegram.bot}` })}</Text>
          ) : null}
        </>
      )}
    </View>
  );
}

/** Invite friends and data received: the referral centre, read when one of these tabs is first opened. */
function ReferralTab({ tab }: { tab: 'invite' | 'received' }) {
  const centre = useEsimReferrals();
  if (centre.isPending) return <LoadingState />;
  if (centre.isError)
    return <ErrorState error={centre.error} onRetry={() => void centre.refetch()} />;
  return tab === 'invite' ? (
    <ReferralsContent centre={centre.data} />
  ) : (
    <ReceivedContent centre={centre.data} />
  );
}

function ReceivedContent({ centre }: { centre: EsimReferrals }) {
  const t = useTranslations('esim');
  const format = useFormatter();
  const date = (value: string) => format.dateTime(new Date(value), { dateStyle: 'medium' });
  const { received, welcomeCoupon } = centre;

  if (!received && !welcomeCoupon) {
    return (
      <View className="rounded-xl bg-surface p-4">
        <Text className="text-muted">{t('receivedNone')}</Text>
      </View>
    );
  }
  const discount = welcomeCoupon
    ? welcomeCoupon.discount.kind === 'percent'
      ? `${welcomeCoupon.discount.percent}%`
      : welcomeCoupon.discount.amount.formatted
    : '';

  return (
    <>
      {received ? (
        <View className="gap-2 rounded-xl bg-surface p-4">
          <Text variant="subheading">{t('receivedTitle')}</Text>
          <Text variant="caption">
            {t('receivedFrom', { who: received.from, date: date(received.joinedAt) })}
          </Text>
          {received.data ? (
            <Text variant="price">+{received.data.formatted}</Text>
          ) : received.pending ? (
            <Text>{t('receivedPending', { amount: received.pending.formatted })}</Text>
          ) : null}
        </View>
      ) : null}
      {welcomeCoupon ? (
        <View className="gap-1 rounded-xl bg-surface p-4">
          <Text variant="subheading">{t('welcomeCoupon')}</Text>
          <Text variant="heading" selectable>
            {welcomeCoupon.code}
          </Text>
          <Text>{t('welcomeOff', { discount })}</Text>
          <Text variant="caption">
            {welcomeCoupon.active
              ? welcomeCoupon.endsAt
                ? t('welcomeEnds', { date: date(welcomeCoupon.endsAt) })
                : t('welcomeUse')
              : t('welcomeDone')}
          </Text>
        </View>
      ) : null}
    </>
  );
}

function ExchangeCard({ rewards }: { rewards: EsimRewards }) {
  const t = useTranslations('esim');
  const toast = useToast();
  const describe = useErrorMessage();
  const redeem = useRedeemEsimReward();
  const [chosen, setChosen] = useState<EsimRewards['items'][number] | null>(null);
  const [key, setKey] = useState(requestId);

  return (
    <View className="gap-3 rounded-xl bg-surface p-4">
      <Text variant="subheading">{t('rewardsExchange')}</Text>
      {rewards.items.length === 0 ? <Text variant="caption">{t('rewardsNoItems')}</Text> : null}
      {rewards.items.map((item) => {
        const short = item.cost.bytes - rewards.balance.bytes;
        return (
          <View key={item.id} className="flex-row items-center gap-3">
            <View className="flex-1 gap-0.5">
              <Text>{item.name}</Text>
              <Text variant="caption">{item.cost.formatted}</Text>
            </View>
            <Button
              label={t('rewardsRedeem')}
              size="sm"
              disabled={!rewards.enabled || short > 0 || redeem.isPending}
              onPress={() => {
                setKey(requestId());
                setChosen(item);
              }}
            />
          </View>
        );
      })}
      <Sheet
        visible={chosen !== null}
        title={t('rewardsRedeemTitle')}
        onClose={() => setChosen(null)}
        footer={
          <View className="gap-3">
            <Button
              label={t('rewardsRedeem')}
              loading={redeem.isPending}
              onPress={() => {
                if (!chosen) return;
                redeem.mutate(
                  { itemId: chosen.id, requestId: key },
                  {
                    onSuccess: (result) => {
                      setChosen(null);
                      toast.show({
                        message: t('rewardsRedeemDone', { number: result.orderNumber }),
                      });
                    },
                    onError: (error: unknown) => {
                      setChosen(null);
                      const reason = isApiError(error) ? error.reason : undefined;
                      const refusal =
                        reason && reason in REDEEM_REFUSALS
                          ? REDEEM_REFUSALS[reason as keyof typeof REDEEM_REFUSALS]
                          : undefined;
                      toast.show({ message: refusal ? t(refusal) : describe(error) });
                    },
                  }
                );
              }}
            />
            <Button
              label={t('rewardsRedeemCancel')}
              variant="secondary"
              onPress={() => setChosen(null)}
            />
          </View>
        }>
        <Text className="text-muted">
          {chosen
            ? t('rewardsRedeemBody', { name: chosen.name, amount: chosen.cost.formatted })
            : ''}
        </Text>
      </Sheet>
    </View>
  );
}

/** Without an eSIM in use, check-ins give at most so much a period; buying one lifts it. */
function LimitNotice({ limit }: { limit: NonNullable<EsimRewards['checkinLimit']> }) {
  const t = useTranslations('esim');
  const values = { cap: limit.cap.formatted, used: limit.used.formatted };
  const text =
    limit.period === 'day'
      ? t('rewardsLimitDay', values)
      : limit.period === 'week'
        ? t('rewardsLimitWeek', values)
        : t('rewardsLimitMonth', values);
  return (
    <View className="gap-2 rounded-lg bg-warning/10 p-3">
      <Text>{text}</Text>
      <Button
        label={t('rewardsLimitBuy')}
        size="sm"
        variant="secondary"
        onPress={() => router.push('/esim')}
      />
    </View>
  );
}

function HistoryCard({ rewards }: { rewards: EsimRewards }) {
  const t = useTranslations('esim');
  const format = useFormatter();
  // Entries past the first page, read when the shopper asks for more.
  const [wantMore, setWantMore] = useState(false);
  const more = useEsimRewardsHistory(wantMore);
  const history = [...rewards.history, ...(more.data?.pages.flatMap((page) => page.items) ?? [])];
  const pages = rewards.historyPages ?? 1;
  const hasMore = pages > 1 && (!wantMore || more.hasNextPage === true);
  const when = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short' });
  const label = (entry: EsimRewards['history'][number]) => {
    switch (entry.kind) {
      case 'checkin':
        return t('rewardsKind.checkin');
      case 'redeem':
        return entry.status === 'failed'
          ? t('rewardsKind.redeemFailed', { name: entry.itemName ?? '' })
          : t('rewardsKind.redeem', { name: entry.itemName ?? '' });
      case 'refund':
        return t('rewardsKind.refund', { name: entry.itemName ?? '' });
      case 'referral':
        return t('rewardsKind.referral');
      case 'invited':
        return t('rewardsKind.invited');
      case 'adjust':
        return entry.note
          ? t('rewardsKind.adjustNote', { note: entry.note })
          : t('rewardsKind.adjust');
      default:
        return entry.kind;
    }
  };

  return (
    <View className="gap-2 rounded-xl bg-surface p-4">
      <Text variant="subheading">{t('rewardsHistory')}</Text>
      {history.length === 0 ? <Text variant="caption">{t('rewardsNoHistory')}</Text> : null}
      {history.map((entry) => (
        <View key={entry.id} className="flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text>{label(entry)}</Text>
            <Text variant="caption">
              {when(entry.createdAt)}
              {entry.orderNumber ? ` · ${entry.orderNumber}` : ''}
            </Text>
          </View>
          <Text className={entry.amount.bytes >= 0 ? 'text-success' : undefined}>
            {entry.amount.bytes >= 0 ? '+' : ''}
            {entry.amount.formatted}
          </Text>
        </View>
      ))}
      {hasMore ? (
        <Button
          label={t('rewardsHistoryMore')}
          variant="secondary"
          size="sm"
          loading={more.isFetching}
          onPress={() => (wantMore ? void more.fetchNextPage() : setWantMore(true))}
        />
      ) : null}
    </View>
  );
}
