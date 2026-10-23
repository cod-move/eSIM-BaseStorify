import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { CheckoutCoupon } from '@/contracts/mobile/shop/v1';

import { CouponSheet } from './coupon-sheet';

type CouponSectionProps = {
  /** What the quote said about the coupon in it. */
  coupon: CheckoutCoupon | undefined;
  /** True while the store prices the order again. */
  pending: boolean;
  onApply: (code: string) => void;
  onRemove: () => void;
};

/**
 * The "Coupon & Promo Code" card of checkout, with "Add" (or "Change") and the
 * sheet it opens. It says what the quote says: the code and its worth when
 * applied, the refusal when not.
 */
export function CouponSection({ coupon, pending, onApply, onRemove }: CouponSectionProps) {
  const t = useTranslations('coupons');
  const [open, setOpen] = useState(false);

  return (
    <View className="flex-row items-center gap-3 rounded-2xl bg-surface p-4">
      <Icon name="ticket" size={22} />
      <View className="flex-1 gap-0.5">
        <Text variant="subheading">{t('card')}</Text>
        {coupon?.status === 'APPLIED' ? (
          <Text variant="caption" className="text-success">
            {coupon.discount
              ? t('appliedBody', { code: coupon.code, amount: coupon.discount.formatted })
              : t('appliedPlain', { code: coupon.code })}
          </Text>
        ) : null}
        {coupon?.status === 'INVALID' ? (
          <Text variant="caption" className="text-danger">
            {coupon.reasonMessage ?? t('invalid')}
          </Text>
        ) : null}
      </View>
      <Button
        label={coupon ? t('change') : t('add')}
        variant="outline"
        size="sm"
        onPress={() => setOpen(true)}
      />
      <CouponSheet
        visible={open}
        onClose={() => setOpen(false)}
        coupon={coupon}
        pending={pending}
        onApply={onApply}
        onRemove={onRemove}
      />
    </View>
  );
}
