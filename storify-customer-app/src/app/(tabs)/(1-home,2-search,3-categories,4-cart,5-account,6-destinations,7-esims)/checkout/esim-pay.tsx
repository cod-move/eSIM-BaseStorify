import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslations } from 'use-intl';

import { EsimPayScreen } from '@/features/esim/crypto-pay';
import { payInAppWaiting } from '@/features/esim/crypto-pay-session';

/**
 * `/checkout/esim-pay?ref=`: the eSIM payment page's methods, paid in the app
 * (APP-09). Only opened by a payment waiting for it; a link that reaches it
 * otherwise goes back to checkout.
 */
export default function EsimPayRoute() {
  const t = useTranslations('esim.cryptoPay');
  const { ref, method } = useLocalSearchParams<{ ref?: string; method?: string }>();
  // Asked once: the screen goes on showing after the payment it was opened for is told how it ended.
  const [awaited] = useState(payInAppWaiting);
  if (typeof ref !== 'string' || !/^ext[0-9a-f]{24}$/.test(ref) || !awaited) {
    return <Redirect href="/checkout" />;
  }
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <EsimPayScreen
        checkoutRef={ref}
        method={typeof method === 'string' && /^[a-z0-9-]{1,40}$/.test(method) ? method : undefined}
      />
    </>
  );
}
