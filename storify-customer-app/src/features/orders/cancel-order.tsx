import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { isApiError } from '@/api/errors';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import type { OrderCancelResult } from '@/contracts/mobile/shop/v1';

import { useCancelOrder } from './use-orders';

/**
 * "Cancel Order" and the sheet that asks first. The store fixes the
 * reason; the app only asks whether the shopper is sure, and says what
 * happened to the money.
 */
export function CancelOrder({ id }: { id: string }) {
  const t = useTranslations();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const cancel = useCancelOrder(id);

  const done = (result: OrderCancelResult) => {
    setOpen(false);
    const { refund } = result;
    const message = refund?.refunded
      ? refund.amount
        ? t('orders.refundOnItsWay', { amount: refund.amount.formatted })
        : t('orders.cancelDone')
      : refund?.owed
        ? t('orders.refundOwed')
        : t('orders.cancelDone');
    toast.show({ message });
  };

  const failed = (error: unknown) => {
    setOpen(false);
    const reason = isApiError(error) ? error.reason : undefined;
    toast.show({
      message:
        reason === 'NOT_CANCELLABLE'
          ? t('orders.notCancellable')
          : reason === 'PAYMENT_IN_PROGRESS'
            ? t('orders.paymentInProgress')
            : t('common.errorTitle'),
    });
  };

  return (
    <>
      <Button label={t('orders.cancel')} variant="outline" onPress={() => setOpen(true)} />
      <Sheet
        visible={open}
        title={t('orders.cancelTitle')}
        onClose={() => setOpen(false)}
        footer={
          <View className="gap-3">
            <Button
              label={t('orders.cancelConfirm')}
              variant="danger"
              loading={cancel.isPending}
              onPress={() => cancel.mutate(undefined, { onSuccess: done, onError: failed })}
            />
            <Button
              label={t('orders.keepOrder')}
              variant="secondary"
              onPress={() => setOpen(false)}
            />
          </View>
        }>
        <Text className="text-muted">{t('orders.cancelBody')}</Text>
      </Sheet>
    </>
  );
}
