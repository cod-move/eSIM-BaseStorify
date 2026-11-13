import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { Button } from '@/components/ui/button';
import { Price } from '@/components/ui/price';
import { SearchField } from '@/components/ui/search-field';
import { EmptyState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { ESIM_TOPUP_REFUSALS, type EsimTopups } from '@/contracts/mobile/shop/v1/esim';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cn } from '@/lib/cn';

import { matchTopups, pageOf, TOPUP_SEARCH_FROM } from './topup-filter';
import { useBuyEsimTopup } from './use-esims';

type Refusal = (typeof ESIM_TOPUP_REFUSALS)[number];
const isKnownRefusal = (reason: string): reason is Refusal =>
  (ESIM_TOPUP_REFUSALS as readonly string[]).includes(reason);

/**
 * Top up one eSIM (APP-06): pick a package, and it goes in the cart as the
 * store quoted it. The quote is checked again at checkout.
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
  const [selected, setSelected] = useState<string | null>(topups.offers[0]?.topupPlanId ?? null);
  // A supplier like BNESIM offers top-ups for other regions too: many of them, so searchable and in pages.
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const matching = matchTopups(topups.offers, query);
  const shown = pageOf(matching, page);

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
  if (topups.offers.length === 0) {
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

  const add = () => {
    if (!selected) return;
    buy.mutate(selected, {
      onSuccess: () => router.push('/cart'),
      onError: (error: unknown) => toast.show({ message: describe(error) }),
    });
  };

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-3 px-4 pt-3"
        contentContainerStyle={{ paddingBottom: tabBar + 96 }}>
        <Text variant="caption">
          {topups.mode === 'addon' ? t('topupAddonNote') : t('topupStackNote')}
        </Text>
        {topups.offers.length >= TOPUP_SEARCH_FROM ? (
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
        {query.trim() && !matching.length ? <Text variant="caption">{t('topupSearchNone')}</Text> : null}
        <View className="gap-2" accessibilityRole="radiogroup">
          {shown.items.map((offer) => {
            const isSelected = offer.topupPlanId === selected;
            return (
              <Pressable
                key={offer.topupPlanId}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${offer.name}, ${offer.data}, ${t('days', { count: offer.validityDays })}, ${offer.price.formatted}`}
                onPress={() => setSelected(offer.topupPlanId)}
                className={cn(
                  'flex-row items-center gap-3 rounded-xl border-[1.5px] bg-surface px-4 py-3 active:opacity-80',
                  isSelected ? 'border-accent' : 'border-surface'
                )}>
                <View className="flex-1 gap-0.5">
                  {/* The package's own name: where it works, for a supplier that tops up other regions. */}
                  {offer.name ? (
                    <Text variant="caption" numberOfLines={2}>
                      {offer.name}
                    </Text>
                  ) : null}
                  <Text variant="subheading">{offer.data}</Text>
                  <Text variant="caption">{t('days', { count: offer.validityDays })}</Text>
                </View>
                <Price price={offer.price} size="md" />
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
        <Button label={t('topupAdd')} loading={buy.isPending} disabled={!selected} onPress={add} />
      </View>
    </View>
  );
}
