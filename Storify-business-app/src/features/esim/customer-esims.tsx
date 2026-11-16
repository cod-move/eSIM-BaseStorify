import { router, type Href } from 'expo-router';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { Price } from '@/components/ui/price';
import { RowGroup, SectionLabel } from '@/components/ui/rows';
import { InlineError, LoadingState } from '@/components/ui/state-view';
import { StatusChip } from '@/components/ui/status-chip';
import { Text } from '@/components/ui/text';

import { EsimCard } from './esims-screen';
import { useCustomerEsims, useEsimAccess } from './use-esim';

/** How many of the customer's eSIMs the profile shows. */
const SHOWN = 5;

/**
 * The customer's eSIMs and number cards on their profile (patch P77), and,
 * with Manage eSIM, a way to email them. Nothing for an operator without the
 * eSIM permissions.
 */
export function CustomerEsims({ id, email }: { id: string; email?: string }) {
  const t = useTranslations('esim.customer');
  const { view, manage } = useEsimAccess();
  const query = useCustomerEsims(id, view);
  if (!view) return null;

  const data = query.data;
  const more = data ? data.total - Math.min(SHOWN, data.esims.length) : 0;

  return (
    <View className="gap-3">
      {manage && email ? (
        <Button
          label={t('email')}
          icon="mail"
          variant="secondary"
          onPress={() => router.push(`/esim/customer-email/${encodeURIComponent(id)}` as Href)}
        />
      ) : null}

      <View>
        <SectionLabel title={t('esims')} />
        {query.isPending ? (
          <LoadingState shape="rows" rows={2} />
        ) : query.isError && !data ? (
          <InlineError error={query.error} onRetry={() => void query.refetch()} />
        ) : data && data.esims.length ? (
          <View className="gap-2">
            {data.esims.slice(0, SHOWN).map((esim) => (
              <EsimCard key={esim.id} esim={esim} />
            ))}
            {more > 0 ? (
              <Text variant="caption" className="px-1">
                {t('more', { count: more })}
              </Text>
            ) : null}
          </View>
        ) : (
          <RowGroup>
            <Text variant="meta" className="px-4 py-3">
              {t('noEsims')}
            </Text>
          </RowGroup>
        )}
      </View>

      {data?.numbers.length ? (
        <RowGroup title={t('numbers')}>
          {data.numbers.map((number) => (
            <View key={number.id} className="gap-0.5 px-4 py-3">
              <View className="flex-row items-center gap-2">
                <Text variant="label" className="flex-1" selectable>
                  +{number.msisdn}
                </Text>
                {number.blocked ? <StatusChip tone="danger" label={t('blocked')} /> : null}
              </View>
              <Text variant="caption" selectable>
                {number.iccid}
              </Text>
              {number.balance ? (
                <View className="flex-row items-center gap-1">
                  <Text variant="meta">{t('balance')}</Text>
                  <Price money={number.balance} />
                </View>
              ) : null}
            </View>
          ))}
        </RowGroup>
      ) : null}
    </View>
  );
}
