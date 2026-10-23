import { useEffect, useState } from 'react';
import { Platform, TextInput, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import type { CheckoutCoupon, ShopperCoupon } from '@/contracts/mobile/shop/v1';
import { cn } from '@/lib/cn';

import { CouponTicket, type TicketState } from './coupon-ticket';
import { useCouponList } from './use-coupon-list';

/** The store's coupon codes are at least this long; a shorter one is not worth asking about. */
const MIN_CODE_LENGTH = 3;
/** And at most this long (the contract's `couponCode`). */
const MAX_CODE_LENGTH = 20;

const same = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase();

type CouponSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** What the quote said about the coupon in it: applied, or refused; none when it carries no code. */
  coupon: CheckoutCoupon | undefined;
  /** True while the store prices the order again with a coupon asked for or taken off. */
  pending: boolean;
  /** Ask the quote to carry this code. */
  onApply: (code: string) => void;
  /** Ask the quote to carry no code. */
  onRemove: () => void;
};

/**
 * The "Coupons" sheet of checkout. A coupon is applied by asking the
 * quote to carry its code, so the sheet decides nothing: it sends the code and
 * shows what the store answers. The codes the store offers this shopper are
 * listed as tickets, in its order, each with the store's reason when it cannot
 * be used now; the shopper can also type one in the field pinned below.
 *
 * An applied coupon closes the sheet. A refused one stays open with the
 * store's reason, in the shopper's language.
 */
export function CouponSheet({
  visible,
  onClose,
  coupon,
  pending,
  onApply,
  onRemove,
}: CouponSheetProps) {
  const t = useTranslations('coupons');
  const list = useCouponList(visible);
  const [code, setCode] = useState('');
  // The code last sent, until the shopper changes the field: its answer is the one to show.
  const [sent, setSent] = useState<string>();
  const [tooShort, setTooShort] = useState(false);

  const answer = sent !== undefined && coupon && same(coupon.code, sent) ? coupon : undefined;
  const applied = coupon?.status === 'APPLIED' ? coupon : undefined;
  const settled = pending ? undefined : answer;

  // A sheet that was closed opens empty the next time.
  if (!visible && (code || sent !== undefined || tooShort)) {
    setCode('');
    setSent(undefined);
    setTooShort(false);
  }

  useEffect(() => {
    if (visible && settled?.status === 'APPLIED') onClose();
  }, [visible, settled, onClose]);

  const send = (value: string) => {
    const typed = value.trim();
    if (typed.length < MIN_CODE_LENGTH) {
      setTooShort(true);
      return;
    }
    setTooShort(false);
    setSent(typed);
    onApply(typed);
  };

  const stateOf = (ticket: ShopperCoupon): TicketState => {
    if (applied && same(applied.code, ticket.code)) return 'applied';
    if (!ticket.usable) return 'unavailable';
    if (coupon?.status === 'INVALID' && same(coupon.code, ticket.code)) return 'unavailable';
    return 'available';
  };

  const refusal = settled?.status === 'INVALID' ? settled : undefined;
  const error = tooShort
    ? t('tooShort')
    : refusal
      ? (refusal.reasonMessage ?? t('invalid'))
      : undefined;

  return (
    <Sheet
      visible={visible}
      title={t('title')}
      onClose={onClose}
      footer={
        <View className="gap-2">
          <View className="flex-row items-center gap-3">
            <View
              className={cn(
                'min-h-12 flex-1 flex-row items-center gap-2.5 rounded-full border-[1.5px] ps-4 pe-2',
                error ? 'border-danger' : 'border-border'
              )}>
              <Icon name="ticket" size={20} colorClassName="accent-muted" />
              <TextInput
                value={code}
                onChangeText={(value) => {
                  setCode(value);
                  setTooShort(false);
                }}
                onSubmitEditing={() => send(code)}
                placeholder={t('fieldPlaceholder')}
                placeholderTextColorClassName="accent-muted"
                accessibilityLabel={t('fieldLabel')}
                accessibilityHint={error}
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                maxLength={MAX_CODE_LENGTH}
                returnKeyType="done"
                className={cn(
                  'min-h-11 flex-1 bg-transparent text-[15px] text-foreground',
                  Platform.OS === 'web' && 'outline-none'
                )}
              />
            </View>
            <Button
              label={t('apply')}
              loading={pending && sent !== undefined && code.trim() === sent}
              disabled={pending}
              onPress={() => send(code)}
            />
          </View>
          {error ? (
            <View
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              className="gap-0.5 px-2">
              <Text variant="caption" className="text-danger">
                {error}
              </Text>
            </View>
          ) : null}
        </View>
      }>
      <View className="gap-3">
        {applied ? (
          <View className="flex-row items-center gap-3 rounded-lg bg-surface-alt px-4 py-2">
            <Icon name="check-circle" size={22} colorClassName="accent-success" />
            <Text variant="body" className="flex-1">
              {applied.discount
                ? t('appliedBody', { code: applied.code, amount: applied.discount.formatted })
                : t('appliedPlain', { code: applied.code })}
            </Text>
            <Button
              label={t('remove')}
              variant="ghost"
              size="sm"
              accessibilityLabel={t('removeLabel', { code: applied.code })}
              disabled={pending}
              onPress={() => {
                setSent(undefined);
                onRemove();
              }}
            />
          </View>
        ) : null}
        {list.isPending ? (
          <View accessible accessibilityRole="progressbar" accessibilityLabel={t('loading')}>
            <Skeleton className="h-36 w-full rounded-lg" />
          </View>
        ) : list.isError ? (
          <View className="flex-row items-center gap-3 px-2">
            <Text variant="caption" className="flex-1 text-muted">
              {t('listError')}
            </Text>
            <Button
              label={t('retry')}
              variant="ghost"
              size="sm"
              onPress={() => void list.refetch()}
            />
          </View>
        ) : list.data.items.length === 0 ? (
          <Text variant="caption" className="px-2 text-muted">
            {t('listEmpty')}
          </Text>
        ) : (
          list.data.items.map((item) => (
            <CouponTicket
              key={item.code}
              coupon={item}
              state={stateOf(item)}
              busy={pending}
              onApply={() => send(item.code)}
            />
          ))
        )}
      </View>
    </Sheet>
  );
}
