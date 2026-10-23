import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Divider } from '@/components/ui/divider';
import { Text } from '@/components/ui/text';
import type { Money, ReturnRefund } from '@/contracts/mobile/shop/v1';

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3 rounded-xl bg-surface p-4">
      <Text variant="subheading">{title}</Text>
      {children}
    </View>
  );
}

export function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className={strong ? 'shrink font-semibold' : 'shrink text-muted'}>{label}</Text>
      <Text variant={strong ? 'price' : 'body'} className="text-end">
        {value}
      </Text>
    </View>
  );
}

/**
 * A refund as the store sent it, row by row, ending with what comes back.
 * Every figure is printed as sent; a zero row says nothing and is left out
 * (the amount is only looked at, never worked out). A quote says when the
 * store keeps the delivery (`refundsShipping` false), so the shopper does not
 * expect it back, and calls its last row the estimate it is.
 */
export function RefundRows({
  refund,
  refundsShipping,
  estimated = false,
}: {
  refund: ReturnRefund;
  /** From a preview: whether the store hands the delivery back for this reason. */
  refundsShipping?: boolean;
  /** A preview, not a return the store has priced. */
  estimated?: boolean;
}) {
  const t = useTranslations('returns');
  const shown = (money: Money) => money.amount !== 0;

  return (
    <View className="gap-2">
      <Row label={t('refundItems')} value={refund.items.formatted} />
      {shown(refund.discount) ? (
        <Row label={t('refundDiscount')} value={refund.discount.formatted} />
      ) : null}
      {shown(refund.tax) ? <Row label={t('refundTax')} value={refund.tax.formatted} /> : null}
      {shown(refund.shipping) ? (
        <Row label={t('refundShipping')} value={refund.shipping.formatted} />
      ) : refundsShipping === false ? (
        <Row label={t('refundShipping')} value={t('notRefunded')} />
      ) : null}
      {shown(refund.restockingFee) ? (
        <Row label={t('restockingFee')} value={refund.restockingFee.formatted} />
      ) : null}
      {shown(refund.returnShippingFee) ? (
        <Row label={t('returnShippingFee')} value={refund.returnShippingFee.formatted} />
      ) : null}
      <Divider />
      <Row
        label={t(estimated ? 'estimatedRefund' : 'refundTotal')}
        value={refund.total.formatted}
        strong
      />
    </View>
  );
}
