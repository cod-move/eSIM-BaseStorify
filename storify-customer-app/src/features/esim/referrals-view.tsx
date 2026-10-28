import { setStringAsync } from 'expo-clipboard';
import { useState } from 'react';
import { ScrollView, Share, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { ESIM_REWARD_STATUSES, type EsimReferrals } from '@/contracts/mobile/shop/v1/esim';
import { useErrorMessage } from '@/i18n/use-error-message';

import { useSetReferralCode } from './use-account';

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
  const format = useFormatter();
  const toast = useToast();
  const describe = useErrorMessage();
  const tabBar = useTabBarHeight();
  const setCode = useSetReferralCode();
  const [code, setCodeText] = useState(centre.code);
  const rate = (value: Rate) =>
    value.kind === 'percent' ? `${value.percent}%` : value.amount.formatted;
  const date = (value: string) => format.dateTime(new Date(value), { dateStyle: 'medium' });

  if (!centre.enabled) {
    return <Text className="p-6 text-center text-muted">{t('referralsOff')}</Text>;
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 px-4 pt-3"
      contentContainerStyle={{ paddingBottom: tabBar + 16 }}
      keyboardShouldPersistTaps="handled">
      <View className="gap-3 rounded-xl bg-surface p-4">
        <Text variant="subheading">{t('inviteTitle')}</Text>
        <Text>
          {centre.offer.friendDiscount
            ? t('inviteOfferBoth', {
                friend: rate(centre.offer.friendDiscount),
                you: rate(centre.offer.commission),
              })
            : t('inviteOffer', { you: rate(centre.offer.commission) })}
        </Text>
        <Text variant="caption" selectable>
          {centre.link}
        </Text>
        <View className="flex-row gap-2">
          <Button
            label={t('share')}
            icon="share"
            className="flex-1"
            onPress={() => void Share.share({ message: centre.link })}
          />
          <Button
            label={t('copy')}
            icon="copy"
            variant="secondary"
            className="flex-1"
            onPress={() => {
              setStringAsync(centre.link)
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
            onPress={() =>
              setCode.mutate(code.trim(), {
                onSuccess: (saved) => {
                  setCodeText(saved.code);
                  toast.show({ message: t('codeSaved') });
                },
                onError: (error: unknown) => toast.show({ message: describe(error) }),
              })
            }
          />
        ) : null}
      </View>

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

      <View className="gap-2 rounded-xl bg-surface p-4">
        <Text variant="subheading">{t('invited', { count: centre.invited.length })}</Text>
        {centre.invited.length === 0 ? <Text variant="caption">{t('invitedNone')}</Text> : null}
        {centre.invited.map((friend) => (
          <View key={friend.id} className="flex-row justify-between gap-3">
            <Text className="flex-1">{friend.who}</Text>
            <Text variant="caption">{date(friend.joinedAt)}</Text>
            <Text>{friend.rewards.formatted}</Text>
          </View>
        ))}
      </View>

      {centre.rewards.length ? (
        <View className="gap-2 rounded-xl bg-surface p-4">
          <Text variant="subheading">{t('rewards')}</Text>
          {centre.rewards.map((reward) => (
            <View key={reward.id} className="flex-row items-center justify-between gap-3">
              <View className="flex-1">
                <Text>{reward.orderNumber}</Text>
                <Text variant="caption">
                  {isKnownStatus(reward.status)
                    ? t(`rewardStatus.${reward.status}`)
                    : reward.status}
                  {reward.status === 'pending'
                    ? ` · ${t('payableOn', { date: date(reward.payableAt) })}`
                    : ''}
                </Text>
              </View>
              <Text>{reward.amount.formatted}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}
