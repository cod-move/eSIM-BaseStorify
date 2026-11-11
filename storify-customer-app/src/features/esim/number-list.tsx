import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { EsimNumberSummary } from '@/contracts/mobile/shop/v1/esim';

import { Pill } from './number-ui';

/**
 * The shopper's phone numbers in My eSIMs (NUM-06), above their data eSIMs:
 * the number, its name, balance and state, each opening the number's page.
 */
export function NumberList({
  numbers,
  withEsims,
}: {
  numbers: EsimNumberSummary[];
  withEsims: boolean;
}) {
  const t = useTranslations('esim.number');
  const router = useRouter();

  return (
    <View className="gap-3 pb-3">
      <Text variant="subheading">{t('listTitle')}</Text>
      {numbers.map((number) => (
        <NumberCard
          key={number.id}
          number={number}
          onPress={() =>
            router.push({ pathname: '/account/esims/numbers/[id]', params: { id: number.id } })
          }
        />
      ))}
      {withEsims ? (
        <Text variant="subheading" className="pt-2">
          {t('esimsTitle')}
        </Text>
      ) : null}
    </View>
  );
}

function NumberCard({ number, onPress }: { number: EsimNumberSummary; onPress: () => void }) {
  const t = useTranslations('esim.number');
  const format = useFormatter();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={number.remark ? `${number.display}, ${number.remark}` : number.display}
      onPress={onPress}
      className="gap-3 rounded-xl bg-surface p-4 active:opacity-80">
      <View className="flex-row items-start gap-3">
        <Icon name="phone" size={24} />
        <View className="flex-1 gap-0.5">
          <Text variant="subheading" className="font-mono" numberOfLines={1}>
            {number.display}
          </Text>
          <Text variant="caption" numberOfLines={1}>
            {[
              number.remark,
              number.balance ? t('balanceShort', { amount: number.balance.formatted }) : null,
              number.validUntil
                ? t('keptUntil', {
                    date: format.dateTime(new Date(number.validUntil), { dateStyle: 'medium' }),
                  })
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        <Icon name="chevron-right" size={20} directional />
      </View>
      <Pill label={number.blocked ? t('blocked') : t('active')} danger={number.blocked === true} />
    </Pressable>
  );
}
