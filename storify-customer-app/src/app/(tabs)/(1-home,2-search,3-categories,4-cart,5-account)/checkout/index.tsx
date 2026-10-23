import { Redirect, useRouter } from 'expo-router';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { CheckoutContent } from '@/features/checkout/checkout-content';
import { useCheckoutForm } from '@/features/checkout/use-checkout-form';

/**
 * `/checkout`: the order, priced by the store as the shopper fills the form in.
 * Pushed in the tab it is opened from (the Cart tab, from the cart), so the tab
 * bar shows under it.
 */
export default function CheckoutScreen() {
  const t = useTranslations('checkout');
  const router = useRouter();
  const tabBarHeight = useTabBarHeight();
  const form = useCheckoutForm();
  const { query, quote } = form;

  if (form.signInNeeded) return <Redirect href="/login" />;
  if (quote === undefined) {
    return query.isError ? (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    ) : (
      <LoadingState />
    );
  }
  if (quote.lines.length === 0) {
    return (
      <View className="flex-1 bg-background" style={{ paddingBottom: tabBarHeight }}>
        <EmptyState
          title={t('emptyTitle')}
          body={t('emptyBody')}
          action={<Button label={t('backToCart')} onPress={() => router.navigate('/cart')} />}
        />
      </View>
    );
  }
  return <CheckoutContent form={form} quote={quote} />;
}
