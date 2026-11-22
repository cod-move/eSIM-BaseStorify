import { setStringAsync } from 'expo-clipboard';
import { useState } from 'react';
import { ScrollView, Share, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { isApiError } from '@/api/errors';
import { ESIM_REWARD_STATUSES, type EsimReferrals } from '@/contracts/mobile/shop/v1/esim';
import { useErrorMessage } from '@/i18n/use-error-message';

import { useEsimReferralFriends, useSetReferralCode } from './use-account';

/** The store's own rule for a code (lib/esim/referral/rules.ts). */
const CODE_PATTERN = /^[A-Z0-9]{4,16}$/;
const CODE_REFUSALS = {
  REFERRAL_CODE_FORMAT: 'codeFormat',
  REFERRAL_CODE_RESERVED: 'codeReserved',
  REFERRAL_CODE_TAKEN: 'codeTaken',
} as const;

type Rate = EsimReferrals['offer']['commission'];
type RewardStatus = (typeof ESIM_REWARD_STATUSES)[number];
const isKnownStatus = (status: string): status is RewardStatus =>
  (ESIM_REWARD_STATUSES as readonly string[]).includes(status);

/**
 * Invite friends (APP-07): the shopper's code and link, what a friend gets
 * and what an order of theirs earns, who joined and the rewards so far.
 */
export function ReferralsView({ centre }: { centre: EsimReferrals }) {
  const t = useTranslations('esim');
  const tabBar = useTabBarHeight();

  if (!centre.enabled) {
    return <Text className="p-6 text-center text-muted">{t('referralsOff')}</Text>;
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 px-4 pt-3"
      contentContainerStyle={{ paddingBottom: tabBar + 16 }}
      keyboardShouldPersistTaps="handled">
      <ReferralsContent centre={centre} />
    </ScrollView>
  );
}

/**
 * The referral centre's cards without a scroll view of their own, for the
 * rewards centre's "Invite friends" tab: the offer (money or data), the link
 * and code, totals, friends and rewards.
 */
export function ReferralsContent({ centre }: { centre: EsimReferrals }) {
  const t = useTranslations('esim');
  const format = useFormatter();
  const toast = useToast();
  const describe = useErrorMessage();
  const setCode = useSetReferralCode();
  const [code, setCodeText] = useState(centre.code);
  // Friends past the first page, read when the shopper asks for more.
  const [wantMore, setWantMore] = useState(false);
  const more = useEsimReferralFriends(wantMore);
  const friends = [...centre.invited, ...(more.data?.pages.flatMap((page) => page.items) ?? [])];
  const friendsTotal = centre.invitedTotal ?? centre.invited.length;
  // The last 30 days' rewards, money and data together, newest first.
  const rewardRows = [
    ...centre.rewards.map((reward) => ({
      kind: 'money' as const,
      at: reward.creditedAt ?? reward.payableAt,
      reward,
    })),
    ...(centre.dataRewards ?? []).map((reward) => ({ kind: 'data' as const, at: reward.at, reward })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const rate = (value: Rate) =>
    value.kind === 'percent' ? `${value.percent}%` : value.amount.formatted;
  const date = (value: string) => format.dateTime(new Date(value), { dateStyle: 'medium' });

  const data = centre.offer.rewardType === 'data' ? centre.offer.data : undefined;
  const when = (on: 'signup' | 'first_order') =>
    on === 'signup' ? t('whenSignup') : t('whenFirstOrder');

  if (!centre.enabled) {
    return <Text className="p-6 text-center text-muted">{t('referralsOff')}</Text>;
  }

  return (
    <>
      <View className="gap-3 rounded-xl bg-surface p-4">
        <Text variant="subheading">{t('inviteTitle')}</Text>
        {data ? (
          <Text>
            {t('inviteOfferData', { you: data.referrer.formatted, when: when(data.referrerOn) })}
            {data.invitee.bytes > 0
              ? ` ${t('inviteFriendData', { friend: data.invitee.formatted, when: when(data.inviteeOn) })}`
              : ''}
          </Text>
        ) : (
          <Text>
            {centre.offer.friendDiscount
              ? t('inviteOfferBoth', {
                  friend: rate(centre.offer.friendDiscount),
                  you: rate(centre.offer.commission),
                })
              : t('inviteOffer', { you: rate(centre.offer.commission) })}
          </Text>
        )}
        <Text variant="caption" selectable>
          {centre.link}
        </Text>
        <View className="flex-row gap-2">
          <Button
            label={t('share')}
            icon="share"
            className="flex-1"
            onPress={() => void Share.share({ message: `${t('referralShareText')}\n${centre.link}` })}
          />
          <Button
            label={t('copy')}
            icon="copy"
            variant="secondary"
            className="flex-1"
            onPress={() => {
              setStringAsync(`${t('referralShareText')}\n${centre.link}`)
                .then(() => toast.show({ message: t('copied') }))
                .catch(() => undefined);
            }}
          />
        </View>
        <TextField
          label={t('yourCode')}
          value={code}
          onChangeText={setCodeText}
          on="surface"
          autoCapitalize="characters"
        />
        {code.trim() && code.trim().toUpperCase() !== centre.code ? (
          <Button
            label={t('saveCode')}
            variant="secondary"
            loading={setCode.isPending}
            onPress={() => {
              const wanted = code.trim().toUpperCase();
              // Said before asking the store: 4 to 16 letters and digits.
              if (!CODE_PATTERN.test(wanted)) {
                toast.show({ message: t('codeFormat') });
                return;
              }
              setCode.mutate(wanted, {
                onSuccess: (saved) => {
                  setCodeText(saved.code);
                  toast.show({ message: t('codeSaved') });
                },
                onError: (error: unknown) => {
                  const reason = isApiError(error) ? error.reason : undefined;
                  const key =
                    reason && reason in CODE_REFUSALS
                      ? CODE_REFUSALS[reason as keyof typeof CODE_REFUSALS]
                      : undefined;
                  toast.show({ message: key ? t(key) : describe(error) });
                },
              });
            }}
          />
        ) : null}
      </View>

      {data ? (
        <View className="gap-1 rounded-xl bg-surface p-4">
          <Text variant="caption">{t('dataEarned')}</Text>
          <Text variant="price">{centre.dataEarned?.formatted ?? '0 MB'}</Text>
        </View>
      ) : (
        <View className="flex-row gap-3">
          <View className="flex-1 gap-1 rounded-xl bg-surface p-4">
            <Text variant="caption">{t('rewardsCredited')}</Text>
            <Text variant="price">{centre.totals.credited.formatted}</Text>
          </View>
          <View className="flex-1 gap-1 rounded-xl bg-surface p-4">
            <Text variant="caption">{t('rewardsPending')}</Text>
            <Text variant="price">{centre.totals.pending.formatted}</Text>
          </View>
        </View>
      )}

      {(centre.rewardsEver ?? centre.rewards.length) > 0 ? (
        <View className="gap-2 rounded-xl bg-surface p-4">
          <View className="flex-row items-baseline justify-between gap-3">
            <Text variant="subheading">{t('rewards')}</Text>
            <Text variant="caption">{t('rewardsLast30')}</Text>
          </View>
          {rewardRows.length === 0 ? <Text variant="caption">{t('rewardsNoneLast30')}</Text> : null}
          {rewardRows.map((row) =>
            row.kind === 'money' ? (
              <View key={row.reward.id} className="flex-row items-center justify-between gap-3">
                <View className="flex-1">
                  <Text>{row.reward.orderNumber}</Text>
                  <Text variant="caption">
                    {isKnownStatus(row.reward.status)
                      ? t(`rewardStatus.${row.reward.status}`)
                      : row.reward.status}
                    {row.reward.status === 'pending'
                      ? ` · ${t('payableOn', { date: date(row.reward.payableAt) })}`
                      : ''}
                  </Text>
                </View>
                <Text>{row.reward.amount.formatted}</Text>
              </View>
            ) : (
              <View key={row.reward.id} className="flex-row items-center justify-between gap-3">
                <View className="flex-1">
                  <Text>{row.reward.who}</Text>
                  <Text variant="caption">{date(row.reward.at)}</Text>
                </View>
                <Text className="text-success">+{row.reward.data.formatted}</Text>
              </View>
            )
          )}
        </View>
      ) : null}

      <View className="gap-2 rounded-xl bg-surface p-4">
        <Text variant="subheading">{t('invited', { count: friendsTotal })}</Text>
        {friendsTotal === 0 ? <Text variant="caption">{t('invitedNone')}</Text> : null}
        {friends.map((friend) => (
          <View key={friend.id} className="flex-row justify-between gap-3">
            <Text className="flex-1">{friend.who}</Text>
            <Text variant="caption">{date(friend.joinedAt)}</Text>
            <Text>{friend.data ? `+${friend.data.formatted}` : friend.rewards.formatted}</Text>
          </View>
        ))}
        {friends.length < friendsTotal && (!wantMore || more.hasNextPage) ? (
          <Button
            label={t('friendsMore', { count: friendsTotal - friends.length })}
            variant="secondary"
            size="sm"
            loading={more.isFetching}
            onPress={() => (wantMore ? void more.fetchNextPage() : setWantMore(true))}
          />
        ) : null}
      </View>

    </>
  );
}
