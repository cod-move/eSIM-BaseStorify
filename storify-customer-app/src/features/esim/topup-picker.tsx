import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { Button } from '@/components/ui/button';
import { Price } from '@/components/ui/price';
import { SearchField } from '@/components/ui/search-field';
import { EmptyState } from '@/components/ui/state-view';
import { Stepper } from '@/components/ui/stepper';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import {
  ESIM_TOPUP_REFUSALS,
  type EsimTopupArea,
  type EsimTopupOffer,
  type EsimTopups,
} from '@/contracts/mobile/shop/v1/esim';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cn } from '@/lib/cn';

import {
  cardName,
  matchAreas,
  matchTopups,
  pageOf,
  TOPUP_SEARCH_FROM,
  topupCards,
} from './topup-filter';
import { useBuyEsimTopup, useEsimTopupArea } from './use-esims';

type Refusal = (typeof ESIM_TOPUP_REFUSALS)[number];
const isKnownRefusal = (reason: string): reason is Refusal =>
  (ESIM_TOPUP_REFUSALS as readonly string[]).includes(reason);

/** Areas listed at once on the "other regions" tab; search finds the rest. */
const AREAS_SHOWN = 30;

/**
 * Top up one eSIM (APP-06): pick a package, and it goes in the cart as the
 * store quoted it. The quote is checked again at checkout.
 *
 * An eSIM that tops up any area has two tabs, as on the website: renewing
 * its own plan, and buying a plan for another area. The other areas come as
 * a list (a supplier may have thousands of top-ups); an area's top-ups are
 * fetched when it is picked. A day-pass is one card with its day counts; one
 * priced per day (`perDay`) takes the days from a stepper, as a day-priced
 * plan does on its product page.
 */
export function TopupPicker({
  esimId,
  topups,
  onRetry,
}: {
  esimId: string;
  topups: EsimTopups;
  onRetry: () => void;
}) {
  const t = useTranslations('esim');
  const router = useRouter();
  const toast = useToast();
  const describe = useErrorMessage();
  const tabBar = useTabBarHeight();
  const buy = useBuyEsimTopup(esimId);
  const otherAreas = topups.otherAreas ?? [];
  const hasOther = otherAreas.length > 0;
  const hasOwn = topups.offers.length > 0;
  const [tab, setTab] = useState<'own' | 'other'>(hasOwn ? 'own' : 'other');
  const [area, setArea] = useState<EsimTopupArea | null>(null);
  const [areaQuery, setAreaQuery] = useState('');
  const areaTopups = useEsimTopupArea(esimId, tab === 'other' && area ? area.id : null);
  const onTab: EsimTopupOffer[] =
    tab === 'own' ? topups.offers : area ? (areaTopups.data?.offers ?? []) : [];
  const [selected, setSelected] = useState<string | null>(topups.offers[0]?.topupPlanId ?? null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  // The days picked for each day pass, by offer; its default days until then.
  const [dayChoice, setDayChoice] = useState<Record<string, number>>({});
  const daysOf = (offer: EsimTopupOffer) =>
    offer.perDay ? (dayChoice[offer.topupPlanId] ?? offer.perDay.defaultDays) : offer.validityDays;
  const cards = topupCards(matchTopups(onTab, query));
  const shown = pageOf(cards, page);
  const areasMatching = matchAreas(otherAreas, areaQuery);

  if (topups.refusal) {
    return (
      <EmptyState
        icon="globe"
        title={t('topupClosed')}
        body={
          isKnownRefusal(topups.refusal)
            ? t(`topupRefusal.${topups.refusal}`)
            : t('topupRefusal.not_supported')
        }
        action={<Button label={t('browse')} onPress={() => router.push('/esim')} />}
      />
    );
  }
  if (!hasOwn && !hasOther) {
    return (
      <EmptyState
        icon="globe"
        title={topups.unavailable ? t('topupUnavailable') : t('topupNone')}
        action={
          topups.unavailable ? (
            <Button label={t('tryAgain')} variant="secondary" onPress={onRetry} />
          ) : undefined
        }
      />
    );
  }

  const chosen = onTab.find((offer) => offer.topupPlanId === selected) ?? null;
  const add = () => {
    if (!chosen) return;
    buy.mutate(
      { topupPlanId: chosen.topupPlanId, ...(chosen.perDay ? { days: daysOf(chosen) } : {}) },
      {
        onSuccess: () => router.push('/cart'),
        onError: (error: unknown) => toast.show({ message: describe(error) }),
      }
    );
  };
  const switchTab = (next: 'own' | 'other') => {
    setTab(next);
    setQuery('');
    setPage(0);
    setSelected(next === 'own' ? (topups.offers[0]?.topupPlanId ?? null) : null);
  };
  const openArea = (next: EsimTopupArea | null) => {
    setArea(next);
    setQuery('');
    setPage(0);
    setSelected(null);
  };

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-3 px-4 pt-3"
        contentContainerStyle={{ paddingBottom: tabBar + 96 }}>
        <Text variant="caption">
          {topups.mode === 'addon'
            ? t('topupAddonNote')
            : topups.stackTarget === 'days'
              ? t('topupStackDaysNote')
              : topups.stackTarget === 'data'
                ? t('topupStackDataNote')
                : t('topupStackNote')}
        </Text>
        {topups.mode === 'addon' ? <Text variant="caption">{t('topupAutoActivate')}</Text> : null}

        {hasOther ? (
          <View className="flex-row rounded-xl bg-surface p-1" accessibilityRole="tablist">
            {(['own', 'other'] as const).map((key) => (
              <Pressable
                key={key}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === key }}
                onPress={() => switchTab(key)}
                className={cn(
                  'flex-1 items-center rounded-lg px-3 py-2',
                  tab === key && 'bg-accent'
                )}>
                <Text variant="label" className={cn(tab === key && 'text-accent-foreground')}>
                  {key === 'own' ? t('topupTabOwn') : t('topupTabOther')}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {tab === 'own' && !hasOwn ? <Text variant="caption">{t('topupNoneHere')}</Text> : null}

        {tab === 'other' && !area ? (
          <View className="gap-2">
            <SearchField
              value={areaQuery}
              onChangeText={setAreaQuery}
              placeholder={t('topupAreaSearch')}
              label={t('topupAreaSearch')}
            />
            {!areasMatching.length ? <Text variant="caption">{t('topupSearchNone')}</Text> : null}
            {areasMatching.slice(0, AREAS_SHOWN).map((entry) => (
              <Pressable
                key={entry.id}
                accessibilityRole="button"
                onPress={() => openArea(entry)}
                className="flex-row items-center gap-3 rounded-xl bg-surface px-4 py-3 active:opacity-80">
                <View className="flex-1 gap-0.5">
                  <Text variant="subheading" numberOfLines={1}>
                    {entry.name}
                  </Text>
                  <Text variant="caption">{t('topupAreaCount', { count: entry.count })}</Text>
                </View>
                <Text variant="caption">{t('topupFrom', { price: entry.from.formatted })}</Text>
              </Pressable>
            ))}
            {areasMatching.length > AREAS_SHOWN ? (
              <Text variant="caption">
                {t('topupAreaMore', { count: areasMatching.length - AREAS_SHOWN })}
              </Text>
            ) : null}
          </View>
        ) : null}

        {tab === 'other' && area ? (
          <View className="flex-row items-center gap-2">
            <Button
              label={t('topupAllAreas')}
              variant="secondary"
              size="sm"
              onPress={() => openArea(null)}
            />
            <Text variant="subheading" numberOfLines={1} className="flex-1">
              {area.name}
            </Text>
            {areaTopups.isFetching ? <ActivityIndicator /> : null}
          </View>
        ) : null}
        {tab === 'other' && area && areaTopups.isError ? (
          <Button
            label={t('tryAgain')}
            variant="secondary"
            onPress={() => void areaTopups.refetch()}
          />
        ) : null}

        {onTab.length >= TOPUP_SEARCH_FROM ? (
          <SearchField
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setPage(0);
            }}
            placeholder={t('topupSearch')}
            label={t('topupSearchLabel')}
          />
        ) : null}
        {query.trim() && !cards.length ? (
          <Text variant="caption">{t('topupSearchNone')}</Text>
        ) : null}
        <View className="gap-2" accessibilityRole="radiogroup">
          {shown.items.map((card) => {
            const picked = card.options.find((option) => option.topupPlanId === selected);
            const first = card.options[0];
            if (!first) return null;
            const offer = picked ?? first;
            const grouped = card.options.length > 1;
            const name = cardName(offer.name, grouped);
            const days = daysOf(offer);
            return (
              <Pressable
                key={card.key}
                accessibilityRole="radio"
                accessibilityState={{ selected: Boolean(picked) }}
                accessibilityLabel={`${name}, ${offer.data}, ${t('days', { count: days })}, ${offer.perDay ? t('topupPerDay', { perDay: offer.perDay.pricePerDay.formatted, min: offer.perDay.minDays, max: offer.perDay.maxDays }) : offer.price.formatted}`}
                onPress={() => !picked && setSelected(first.topupPlanId)}
                className={cn(
                  'gap-2 rounded-xl border-[1.5px] bg-surface px-4 py-3 active:opacity-80',
                  picked ? 'border-accent' : 'border-surface'
                )}>
                <View className="flex-row items-center gap-3">
                  <View className="flex-1 gap-0.5">
                    {name ? (
                      <Text variant="caption" numberOfLines={2}>
                        {name}
                      </Text>
                    ) : null}
                    <Text variant="subheading">{offer.data}</Text>
                    {!grouped && !offer.perDay ? (
                      <Text variant="caption">{t('days', { count: offer.validityDays })}</Text>
                    ) : null}
                  </View>
                  <Price price={offer.perDay ? offer.perDay.pricePerDay : offer.price} size="md" />
                </View>
                {offer.perDay ? (
                  <View className="gap-1">
                    <View className="flex-row items-center justify-between gap-3">
                      <Text>{t('days', { count: days })}</Text>
                      <Stepper
                        value={days}
                        min={offer.perDay.minDays}
                        max={offer.perDay.maxDays}
                        onChange={(next) => {
                          setDayChoice((current) => ({ ...current, [offer.topupPlanId]: next }));
                          setSelected(offer.topupPlanId);
                        }}
                      />
                    </View>
                    <Text variant="caption">
                      {t('topupPerDay', {
                        perDay: offer.perDay.pricePerDay.formatted,
                        min: offer.perDay.minDays,
                        max: offer.perDay.maxDays,
                      })}
                    </Text>
                  </View>
                ) : null}
                {grouped ? (
                  <View className="flex-row flex-wrap gap-2">
                    {card.options.map((option) => {
                      const on = option.topupPlanId === offer.topupPlanId && Boolean(picked);
                      return (
                        <Pressable
                          key={option.topupPlanId}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          onPress={() => setSelected(option.topupPlanId)}
                          className={cn(
                            'rounded-full border px-3 py-1',
                            on ? 'border-accent bg-accent' : 'border-border'
                          )}>
                          <Text variant="caption" className={cn(on && 'text-accent-foreground')}>
                            {t('days', { count: option.validityDays })}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        {shown.pages > 1 ? (
          <View className="flex-row items-center justify-between gap-3 pt-1">
            <Button
              label={t('previous')}
              variant="secondary"
              size="sm"
              disabled={shown.page === 0}
              onPress={() => setPage(shown.page - 1)}
            />
            <Text variant="caption">{`${shown.page + 1} / ${shown.pages}`}</Text>
            <Button
              label={t('next')}
              variant="secondary"
              size="sm"
              disabled={shown.page >= shown.pages - 1}
              onPress={() => setPage(shown.page + 1)}
            />
          </View>
        ) : null}
      </ScrollView>
      <View
        className="absolute inset-x-0 border-t border-border bg-background px-4 pt-3"
        style={{ bottom: tabBar, paddingBottom: 12 }}>
        <Button label={t('topupAdd')} loading={buy.isPending} disabled={!chosen} onPress={add} />
      </View>
    </View>
  );
}
