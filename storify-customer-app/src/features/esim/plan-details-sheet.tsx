import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import type { EsimPlanOption } from '@/contracts/mobile/shop/v1/esim';
import { useErrorMessage } from '@/i18n/use-error-message';

import { useEsimPlanDetails } from './use-destinations';

/** Countries listed before "Show all". */
const SHOWN_COUNTRIES = 8;

/**
 * A plan's details (APP-02), as the website's plan details dialog: data,
 * validity, activation, speed, hotspot, IP, top-up rules, what is included and
 * the countries it works in with their operators. The store words every row in
 * the shopper's language. The button adds the plan to the cart, or — when it
 * still needs days or a start date — takes the shopper back to choose them.
 */
export function PlanDetailsSheet({
  scope,
  slug,
  plan,
  onClose,
  onAdd,
  adding,
}: {
  scope: 'local' | 'multi';
  slug: string;
  /** The plan shown; null keeps the sheet closed. */
  plan: EsimPlanOption | null;
  onClose: () => void;
  onAdd: () => void;
  adding: boolean;
}) {
  const t = useTranslations('esim');
  const describe = useErrorMessage();
  const [allCountries, setAllCountries] = useState(false);
  const query = useEsimPlanDetails(scope, slug, plan?.variantId ?? null);
  const details = query.data;
  const needsChoice = Boolean(plan?.perDay || plan?.startDate);

  const close = () => {
    setAllCountries(false);
    onClose();
  };

  const countries = details
    ? allCountries
      ? details.coverage
      : details.coverage.slice(0, SHOWN_COUNTRIES)
    : [];

  return (
    <Sheet
      visible={plan !== null}
      onClose={close}
      title={t('planDetails')}
      size="tall"
      footer={
        plan ? (
          <View className="flex-row items-center gap-3">
            <View className="flex-1">
              <Text variant="price">{plan.price.formatted}</Text>
            </View>
            <Button
              className="flex-1"
              label={needsChoice ? t('choosePlan') : t('addToCart')}
              loading={adding}
              onPress={needsChoice ? close : onAdd}
            />
          </View>
        ) : null
      }>
      {details ? (
        <View className="gap-1 pb-4">
          <View className="flex-row items-center gap-2">
            <Text variant="title">{details.title}</Text>
            <View className="rounded-full bg-accent/10 px-2 py-0.5">
              <Text variant="caption" className="text-accent">
                {details.kind}
              </Text>
            </View>
          </View>
          <Text variant="caption">{details.days}</Text>

          <View className="mt-3">
            {details.rows.map((row) => (
              <View key={row.key} className="flex-row gap-3 border-t border-border py-3">
                <Text className="w-24 font-semibold">{row.label}</Text>
                <View className="flex-1 gap-1">
                  <Text className="text-muted">{row.text}</Text>
                  {row.lines?.map((line) => (
                    <Text key={line} variant="caption">
                      • {line}
                    </Text>
                  ))}
                  {row.note ? (
                    <Text variant="caption" className="text-warning">
                      {row.note}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>

          {details.coverage.length ? (
            <View className="gap-2 border-t border-border pt-3">
              <Text variant="subheading">{t('planCoverage')}</Text>
              {countries.map((country) => (
                <View key={country.code} className="gap-0.5">
                  <Text>{country.name}</Text>
                  {country.operators.length ? (
                    <Text variant="caption">
                      {country.operators
                        .map((entry) =>
                          entry.network ? `${entry.operator} (${entry.network})` : entry.operator
                        )
                        .join(', ')}
                    </Text>
                  ) : null}
                </View>
              ))}
              {details.coverage.length > SHOWN_COUNTRIES ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setAllCountries((shown) => !shown)}
                  className="min-h-9 justify-center active:opacity-70">
                  <Text className="text-link">
                    {allCountries
                      ? t('filterFewer')
                      : t('showAllCountries', { count: details.coverage.length })}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : query.isError ? (
        <View className="items-center gap-3 py-8">
          <Text className="text-center text-muted">{describe(query.error)}</Text>
          <Button variant="secondary" label={t('retry')} onPress={() => void query.refetch()} />
        </View>
      ) : (
        <View className="items-center py-10">
          <ActivityIndicator />
        </View>
      )}
    </Sheet>
  );
}
