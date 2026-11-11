import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Price } from '@/components/ui/price';
import { Stepper } from '@/components/ui/stepper';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import type { EsimDestinationDetail, EsimPlanOption } from '@/contracts/mobile/shop/v1/esim';
import { useSetCartLine } from '@/features/cart/use-cart';
import { addDays, daysBetween, readableDay } from '@/features/esim/start-date';
import { DestinationFlag } from '@/features/esim/destination-flag';
import { chooseFilter, filterPlans, openValues, type PlanFilters } from '@/features/esim/plan-filter';
import { PlanDetailsSheet } from '@/features/esim/plan-details-sheet';
import { useLocale } from '@/i18n/locale-store';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cn } from '@/lib/cn';

/** A filter shows this many values until opened. */
const COLLAPSED = 6;
/** Plans shown at first, and added by "Show more". */
const PAGE = 20;
/** Filters the app does not offer (the website does): too many values to be of use on a phone. */
const HIDDEN_FILTERS = new Set(['operator']);
/** Where the list starts: a single country's total-data plans, when there are such and others. */
const STARTING_FILTERS: [string, string][] = [
  ['coverage', 'local'],
  ['kind', 'total'],
];

function startingFilters(destination: EsimDestinationDetail): PlanFilters {
  let filters: PlanFilters = {};
  for (const [key, value] of STARTING_FILTERS) {
    const filter = destination.filters?.find((entry) => entry.key === key);
    if (filter?.options.some((option) => option.value === value)) {
      filters = chooseFilter(destination.plans, filters, key, value);
    }
  }
  return filters;
}

/**
 * A destination's plans (APP-02), filtered as on the website (coverage, data
 * type, days, data, top-up, exit IP; the operator filter is left out). A plan's details open from its card: pick one — and for a day-priced plan the
 * days, for one that takes it the day it starts (ORD-03) — and add it to the
 * cart. The cart prices the choice; the app shows
 * only the prices the store sent.
 */
export function DestinationPlans({ destination }: { destination: EsimDestinationDetail }) {
  const t = useTranslations('esim');
  const router = useRouter();
  const toast = useToast();
  const describe = useErrorMessage();
  const tabBar = useTabBarHeight();
  const setLine = useSetCartLine();
  const [filters, setFilters] = useState<PlanFilters>(() => startingFilters(destination));
  // The plan whose details are open.
  const [detailed, setDetailed] = useState<EsimPlanOption | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [limit, setLimit] = useState(PAGE);
  const shown = useMemo(() => filterPlans(destination.plans, filters), [destination.plans, filters]);
  const [selected, setSelected] = useState<string | null>(destination.plans[0]?.variantId ?? null);
  // The chosen plan while the filters keep it, else the first they leave.
  const plan = shown.find((option) => option.variantId === selected) ?? shown[0] ?? null;
  const [days, setDays] = useState<number>(plan?.perDay?.minDays ?? 1);
  const locale = useLocale();
  // Days after the earliest start the store allows; null = starts as usual.
  const [startOffset, setStartOffset] = useState<number | null>(null);
  const startDate =
    plan?.startDate && startOffset !== null ? addDays(plan.startDate.min, startOffset) : null;

  const pickFilter = (key: string, value: string | undefined) => {
    setFilters((current) => chooseFilter(destination.plans, current, key, value));
    setLimit(PAGE);
  };

  const choose = (option: EsimPlanOption) => {
    setSelected(option.variantId);
    if (option.perDay) setDays(option.perDay.minDays);
    if (!option.startDate) setStartOffset(null);
  };

  const add = (onAdded?: () => void) => {
    if (!plan) return;
    setLine.mutate(
      {
        // A region's plan on a country's screen is bought as the region's product.
        productId: plan.productId ?? destination.productId,
        variantId: plan.variantId,
        quantity: 1,
        ...(plan.perDay || startDate
          ? {
              lineAttributes: {
                ...(plan.perDay ? { days } : {}),
                ...(startDate ? { activateOn: startDate } : {}),
              },
            }
          : {}),
      },
      {
        onSuccess: () => {
          onAdded?.();
          toast.show({
            message: t('added'),
            action: { label: t('viewCart'), onPress: () => router.push('/cart') },
          });
        },
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
          <DestinationFlag destination={destination} size={52} />
          <View className="flex-1 gap-0.5">
            <Text variant="title">{destination.name}</Text>
            {destination.scope === 'local' ? null : (
              <Text variant="caption">
                {destination.countryNames.map((country) => country.name).join(', ')}
              </Text>
            )}
          </View>
        </View>

        {destination.filters?.length ? (
          <View className="gap-4 rounded-2xl bg-surface p-4">
            {destination.filters.filter((filter) => !HIDDEN_FILTERS.has(filter.key)).map((filter) => {
              const open = openValues(destination.plans, filters, filter.key);
              const long = filter.options.length > COLLAPSED + 1;
              const chosen = filters[filter.key];
              const options =
                long && !expanded[filter.key]
                  ? filter.options.filter(
                      (option, index) => index < COLLAPSED || option.value === chosen
                    )
                  : filter.options;
              return (
                <View key={filter.key} className="gap-2">
                  <Text variant="subheading">{filter.title}</Text>
                  <View className="flex-row flex-wrap gap-2">
                    <Chip
                      label={t('filterAll')}
                      selected={chosen === undefined}
                      onPress={() => pickFilter(filter.key, undefined)}
                    />
                    {options.map((option) => (
                      <Chip
                        key={option.value}
                        label={option.label}
                        selected={chosen === option.value}
                        onPress={() => pickFilter(filter.key, option.value)}
                        className={
                          chosen !== option.value && !open.has(option.value)
                            ? 'opacity-50'
                            : undefined
                        }
                      />
                    ))}
                    {long ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() =>
                          setExpanded((current) => ({
                            ...current,
                            [filter.key]: !current[filter.key],
                          }))
                        }
                        className="min-h-9 justify-center px-1 active:opacity-70">
                        <Text className="text-link">
                          {expanded[filter.key]
                            ? t('filterFewer')
                            : t('filterMore', { count: filter.options.length - COLLAPSED })}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })}
            <View className="flex-row items-center justify-between border-t border-border pt-3">
              <Text variant="caption">{t('planCount', { count: shown.length })}</Text>
              {Object.keys(filters).length ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setFilters({});
                    setLimit(PAGE);
                  }}
                  className="min-h-9 justify-center active:opacity-70">
                  <Text className="text-link">{t('filterClear')}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {destination.plans.length === 0 ? (
          <Text className="py-6 text-center text-muted">{t('noPlans')}</Text>
        ) : shown.length === 0 ? (
          <Text className="py-6 text-center text-muted">{t('noMatchingPlans')}</Text>
        ) : (
          <View className="gap-2" accessibilityRole="radiogroup">
            {shown.slice(0, limit).map((option) => (
              <PlanCard
                key={option.variantId}
                plan={option}
                selected={option.variantId === plan?.variantId}
                onPress={() => choose(option)}
                onDetails={() => {
                  choose(option);
                  setDetailed(option);
                }}
              />
            ))}
            {shown.length > limit ? (
              <Button
                variant="secondary"
                label={t('showMorePlans', { count: shown.length - limit })}
                onPress={() => setLimit((current) => current + PAGE)}
              />
            ) : null}
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

        {plan?.startDate ? (
          <View className="gap-2 rounded-xl bg-surface p-4">
            <Text variant="subheading">{t('startWhen')}</Text>
            <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
              <Chip
                label={t('startAsUsual')}
                accessibilityRole="radio"
                selected={startOffset === null}
                onPress={() => setStartOffset(null)}
              />
              <Chip
                label={t('startOnDate')}
                accessibilityRole="radio"
                selected={startOffset !== null}
                onPress={() => setStartOffset((current) => current ?? 0)}
              />
            </View>
            {startDate && plan.startDate ? (
              <>
                <View className="flex-row items-center justify-between gap-3">
                  <Text>{readableDay(startDate, locale)}</Text>
                  <Stepper
                    value={startOffset ?? 0}
                    min={0}
                    max={daysBetween(plan.startDate.min, plan.startDate.max)}
                    onChange={setStartOffset}
                  />
                </View>
                <Text variant="caption">{t('startHint')}</Text>
              </>
            ) : null}
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
            onPress={() => add()}
          />
        </View>
      ) : null}

      <PlanDetailsSheet
        scope={destination.pathScope}
        slug={destination.slug}
        plan={detailed}
        onClose={() => setDetailed(null)}
        onAdd={() => add(() => setDetailed(null))}
        adding={setLine.isPending}
      />
    </View>
  );
}

function PlanCard({
  plan,
  selected,
  onPress,
  onDetails,
}: {
  plan: EsimPlanOption;
  selected: boolean;
  onPress: () => void;
  onDetails: () => void;
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
        {plan.region ? (
          <Text variant="caption" className="text-accent" numberOfLines={1}>
            {plan.region}
          </Text>
        ) : null}
        <Text variant="subheading">{plan.data}</Text>
        <Text variant="caption">
          {plan.days ? t('days', { count: plan.days }) : t('pickDays')}
          {plan.topupMode === 'none' ? '' : ` · ${t('topupable')}`}
        </Text>
        {plan.operators?.length ? (
          <Text variant="caption" numberOfLines={1}>
            {plan.operators.slice(0, 3).join(', ')}
            {plan.operators.length > 3 ? ` +${plan.operators.length - 3}` : ''}
          </Text>
        ) : null}
        {selected ? (
          <Pressable
            accessibilityRole="button"
            onPress={onDetails}
            hitSlop={8}
            className="self-start pt-1 active:opacity-70">
            <Text className="text-link">{t('viewDetails')}</Text>
          </Pressable>
        ) : null}
      </View>
      <Price price={plan.price} from={Boolean(plan.perDay)} size="md" />
    </Pressable>
  );
}
