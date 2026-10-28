import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { verifyRedirectPayment } from '@/api/endpoints/redirect-payments';
import { queryKeys } from '@/api/query-keys';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import type { RedirectPaymentMethod } from '@/contracts/mobile/shop/v1';
import { pauseAfter } from '@/features/payments/use-payment-outcome';
import { successHref } from '@/features/payments/success-params';
import { useLocale } from '@/i18n/locale-store';

import { resultOf } from './redirect-payment';
import { redirectPending } from './redirect-pending';

const MAX_ASKS = 40;

/**
 * A payment on a gateway's page that is not finished yet (APP-09): the store
 * is asked on the card's schedule until it knows, then the outcome screen
 * shows the answer. A crypto payment can take minutes; the order is written
 * when it arrives, whether or not this screen is still open.
 */
export function RedirectPending({
  method,
  reference,
}: {
  method: RedirectPaymentMethod;
  reference: string;
}) {
  const t = useTranslations('esim');
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const asks = useRef(0);

  const query = useQuery({
    queryKey: queryKeys.redirectOutcome(locale, reference),
    queryFn: async ({ signal }) => {
      asks.current += 1;
      const verification = await verifyRedirectPayment(
        locale,
        { paymentMethod: method, reference },
        signal
      );
      return { result: resultOf(verification, { method, reference }), asked: asks.current };
    },
    refetchInterval: (current) =>
      current.state.data?.result?.outcome === 'redirect-pending' && asks.current < MAX_ASKS
        ? pauseAfter(asks.current)
        : false,
  });

  const result = query.data?.result;
  const asked = query.data?.asked ?? 0;
  const final = query.data !== undefined && result?.outcome !== 'redirect-pending';
  useEffect(() => {
    if (!final) return;
    redirectPending.clear();
    void queryClient.invalidateQueries({ queryKey: queryKeys.cart(locale) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.orderList(locale, {}).slice(0, 4) });
    router.replace(result ? successHref(result) : '/checkout');
  }, [final, result, locale, queryClient, router]);

  const stuck = !final && (query.isError || asked >= MAX_ASKS);
  // Given up asking on its own: checkout is no longer sent here; the order still arrives if it is paid.
  useEffect(() => {
    if (stuck) redirectPending.clear();
  }, [stuck]);
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
      {stuck ? null : <ActivityIndicator colorClassName="accent-muted" />}
      <Text variant="display" className="text-center">
        {t('payWaitingTitle')}
      </Text>
      <Text className="text-center text-muted">{t('payWaitingText')}</Text>
      {stuck ? (
        <View className="mt-5 self-stretch">
          <Button label={t('payCheckAgain')} onPress={() => void query.refetch()} />
        </View>
      ) : null}
    </View>
  );
}
