import { Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { ShopperCoupon } from '@/contracts/mobile/shop/v1';
import { cn } from '@/lib/cn';

/** What the ticket offers the shopper to do with it. */
export type TicketState = 'available' | 'applied' | 'unavailable';

type CouponTicketProps = {
  coupon: ShopperCoupon;
  state: TicketState;
  /** True while the store prices the order again: the ticket cannot be tapped. */
  busy?: boolean;
  /** The action in place of "Apply", where the ticket does something else: "Copy code", and what a screen reader says for it. */
  action?: { label: string; spoken: string };
  onApply: () => void;
};

/**
 * A coupon as a ticket: the code, each of its conditions and what it gives,
 * and a strip below with "Apply". Two notches cut the sides where the strip
 * begins. A code the store says cannot be used now is dimmed and carries the
 * store's reason; one that is applied says so. The words are the store's; only
 * the action is the app's.
 */
export function CouponTicket({ coupon, state, busy = false, action, onApply }: CouponTicketProps) {
  const t = useTranslations('coupons');
  const available = state === 'available';
  const quiet = state === 'unavailable';
  const reason = coupon.usable ? undefined : coupon.reasonMessage;
  // Where the ticket's action is "Copy code", a quiet ticket still says so, greyed.
  const label =
    state === 'applied' ? t('applied') : (action?.label ?? (quiet ? t('unavailable') : t('apply')));

  return (
    <View className={cn('overflow-hidden rounded-lg', quiet && 'opacity-70')}>
      <View className={cn('gap-1 px-7 pb-3 pt-4', quiet ? 'bg-surface-alt' : 'bg-surface')}>
        <Text
          variant="subheading"
          className={cn('uppercase', quiet && 'text-muted')}
          numberOfLines={1}>
          {coupon.code}
        </Text>
        {coupon.conditions.map((condition, index) => (
          <Text key={index} variant="caption" numberOfLines={2}>
            {condition}
          </Text>
        ))}
        <View className="mt-1 flex-row items-center gap-2">
          <Icon
            name="ticket"
            size={18}
            colorClassName={quiet ? 'accent-muted' : 'accent-foreground'}
          />
          <Text variant="label" className={cn('flex-1', quiet && 'text-muted')} numberOfLines={2}>
            {coupon.benefit}
          </Text>
        </View>
        {reason ? (
          <Text variant="caption" className="mt-1 text-muted">
            {reason}
          </Text>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          available
            ? (action?.spoken ?? t('applyLabel', { code: coupon.code }))
            : t('ticketLabel', { code: coupon.code, state: reason ?? label })
        }
        accessibilityState={{ disabled: !available || busy }}
        disabled={!available || busy}
        onPress={onApply}
        className={cn(
          'min-h-11 flex-row items-center justify-center gap-2 px-4 py-2.5 active:opacity-70',
          quiet ? 'bg-surface-alt' : 'bg-promo',
          busy && 'opacity-60'
        )}>
        {state === 'applied' ? <Icon name="check" size={16} /> : null}
        <Text
          variant="label"
          className={cn('uppercase tracking-[3px]', quiet && 'text-muted')}
          numberOfLines={1}>
          {label}
        </Text>
        {/* The two notches, cut where the strip begins; the sheet's own colour shows through. */}
        <View
          pointerEvents="none"
          className="absolute -start-2.5 -top-2.5 size-5 rounded-full bg-background"
        />
        <View
          pointerEvents="none"
          className="absolute -end-2.5 -top-2.5 size-5 rounded-full bg-background"
        />
      </Pressable>
    </View>
  );
}
