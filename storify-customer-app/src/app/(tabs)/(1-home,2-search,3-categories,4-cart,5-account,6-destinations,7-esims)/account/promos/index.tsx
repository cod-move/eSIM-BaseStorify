import { Stack } from 'expo-router';
import { useTranslations } from 'use-intl';

import { HeaderTitle } from '@/components/shell/app-header';
import { CouponWallet } from '@/features/coupons/coupon-wallet';

/** `/account/promos`: the coupons the store offers the shopper. */
export default function PromosScreen() {
  const t = useTranslations('coupons');

  return (
    <>
      <Stack.Screen
        options={{ headerTitle: () => <HeaderTitle icon="ticket" title={t('title')} /> }}
      />
      <CouponWallet />
    </>
  );
}
