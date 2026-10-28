import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { isApiError } from '@/api/errors';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import type { EsimDetail } from '@/contracts/mobile/shop/v1/esim';

import { useCancelEsim } from './use-esims';

/** "Cancel and refund" (USR-07) and the sheet that asks first, with the store's refund and fee. */
export function CancelEsim({
  id,
  offer,
}: {
  id: string;
  offer: NonNullable<EsimDetail['cancellation']>;
}) {
  const t = useTranslations('esim');
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const cancel = useCancelEsim(id);

  return (
    <>
      <Button label={t('cancelButton')} variant="outline" onPress={() => setOpen(true)} />
      <Sheet
        visible={open}
        title={t('cancelTitle')}
        onClose={() => setOpen(false)}
        footer={
          <View className="gap-3">
            <Button
              label={t('cancelConfirm')}
              variant="danger"
              loading={cancel.isPending}
              onPress={() =>
                cancel.mutate(undefined, {
                  onSuccess: () => {
                    setOpen(false);
                    toast.show({ message: t('cancelDone') });
                  },
                  onError: (error: unknown) => {
                    setOpen(false);
                    toast.show({
                      message:
                        isApiError(error) && error.reason === 'SUPPLIER_REFUSED'
                          ? t('cancelSupplierRefused')
                          : t('cancelFailed'),
                    });
                  },
                })
              }
            />
            <Button label={t('cancelKeep')} variant="secondary" onPress={() => setOpen(false)} />
          </View>
        }>
        <Text className="text-muted">
          {offer.toBalance
            ? t('cancelBodyBalance', { refund: offer.refund.formatted, fee: offer.fee.formatted })
            : t('cancelBodyOriginal', { refund: offer.refund.formatted, fee: offer.fee.formatted })}
        </Text>
      </Sheet>
    </>
  );
}
