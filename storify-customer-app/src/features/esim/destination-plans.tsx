import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { Button } from '@/components/ui/button';
import { Price } from '@/components/ui/price';
import { Stepper } from '@/components/ui/stepper';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import type { EsimDestinationDetail, EsimPlanOption } from '@/contracts/mobile/shop/v1/esim';
import { useSetCartLine } from '@/features/cart/use-cart';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cn } from '@/lib/cn';

/**
 * A destination's plans (APP-02): pick one — and for a day-priced plan the
 * days — and add it to the cart. The cart prices the choice; the app shows
 * only the prices the store sent.
 */
export function DestinationPlans({ destination }: { destination: EsimDestinationDetail }) {
  const t = useTranslations('esim');
  const router = useRouter();
  const toast = useToast();
  const describe = useErrorMessage();
  const tabBar = useTabBarHeight();
  const setLine = useSetCartLine();
  const [selected, setSelected] = useState<string | null>(destination.plans[0]?.variantId ?? null);
  const plan = destination.plans.find((option) => option.variantId === selected) ?? null;
  const [days, setDays] = useState<number>(plan?.perDay?.minDays ?? 1);

  const choose = (option: EsimPlanOption) => {
    setSelected(option.variantId);
    if (option.perDay) setDays(option.perDay.minDays);
  };

  const add = () => {
    if (!plan) return;
    setLine.mutate(
      {
        productId: destination.productId,
        variantId: plan.variantId,
        quantity: 1,
        ...(plan.perDay ? { lineAttributes: { days } } : {}),
      },
      {
        onSuccess: () =>
          toast.show({
            message: t('added'),
            action: { label: t('viewCart'), onPress: () => router.push('/cart') },
          }),
        onError: (error: unknown) => toast.show({ message: describe(error) }),
      }
    );
  };

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 px-4 pt-3"
        contentContainerStyle={{ paddingBottom: tabBar + 96 }}>
        <View className="flex-row items-center gap-3">
          {destination.emoji ? <Text variant="display">{destination.emoji}</Text> : null}
          <View className="flex-1 gap-0.5">
            <Text variant="title">{destination.name}</Text>
            {destination.scope === 'local' ? null : (
              <Text variant="caption">
                {destination.countryNames.map((country) => country.name).join(', ')}
              </Text>
            )}
          </View>
        </View>

        {destination.plans.length === 0 ? (
          <Text className="py-6 text-center text-muted">{t('noPlans')}</Text>
        ) : (
          <View className="gap-2" accessibilityRole="radiogroup">
            {destination.plans.map((option) => (
              <PlanCard
                key={option.variantId}
                plan={option}
                selected={option.variantId === selected}
                onPress={() => choose(option)}
              />
            ))}
          </View>
        )}

        {plan?.perDay ? (
          <View className="gap-2 rounded-xl bg-surface p-4">
            <Text variant="subheading">{t('howManyDays')}</Text>
            <View className="flex-row items-center justify-between gap-3">
              <Text>{t('days', { count: days })}</Text>
              <Stepper
                value={days}
                min={plan.perDay.minDays}
                max={plan.perDay.maxDays}
                onChange={setDays}
              />
            </View>
            <Text variant="caption">
              {t('perDayNote', {
                days: plan.perDay.minDays,
                price: plan.price.formatted,
                perDay: plan.perDay.pricePerDay.formatted,
              })}
            </Text>
          </View>
        ) : null}

        {destination.networks.length ? (
          <View className="gap-1 rounded-xl bg-surface p-4">
            <Text variant="subheading">{t('networks')}</Text>
            {destination.networks.map((network) => (
              <Text key={`${network.countryCode}:${network.operator}`} variant="caption">
                {network.countryCode} · {network.operator}
                {network.network ? ` (${network.network})` : ''}
              </Text>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {plan ? (
        <View
          className="absolute inset-x-0 border-t border-border bg-background px-4 pt-3"
          style={{ bottom: tabBar, paddingBottom: 12 }}>
          <Button
            label={t('addToCart')}
            trailing={plan.perDay ? undefined : plan.price.formatted}
            loading={setLine.isPending}
            onPress={add}
          />
        </View>
      ) : null}
    </View>
  );
}

function PlanCard({
  plan,
  selected,
  onPress,
}: {
  plan: EsimPlanOption;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useTranslations('esim');
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${plan.data}, ${plan.days ? t('days', { count: plan.days }) : t('pickDays')}, ${plan.price.formatted}`}
      onPress={onPress}
      className={cn(
        'flex-row items-center gap-3 rounded-xl border-[1.5px] bg-surface px-4 py-3 active:opacity-80',
        selected ? 'border-accent' : 'border-surface'
      )}>
      <View className="flex-1 gap-0.5">
        <Text variant="subheading">{plan.data}</Text>
        <Text variant="caption">
          {plan.days ? t('days', { count: plan.days }) : t('pickDays')}
          {plan.topupMode === 'none' ? '' : ` · ${t('topupable')}`}
        </Text>
      </View>
      <Price price={plan.price} from={Boolean(plan.perDay)} size="md" />
    </Pressable>
  );
}
