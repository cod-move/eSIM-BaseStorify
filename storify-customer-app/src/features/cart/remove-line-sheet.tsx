import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { Sheet, SheetActions } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import type { CartLine } from '@/contracts/mobile/shop/v1';
import { useErrorMessage } from '@/i18n/use-error-message';

import { CartLineBody } from './cart-line-row';
import { useRemoveCartLine } from './use-cart';

type RemoveLineSheetProps = {
  /** The line to remove; the sheet is open while there is one. */
  line: CartLine | undefined;
  onClose: () => void;
};

/**
 * "Remove from Cart?": the line as it is in the cart, without its
 * stepper, then Cancel and "Yes, Remove". The sheet closes once the store has
 * removed the line, and stays open with the reason if it has not.
 */
export function RemoveLineSheet({ line, onClose }: RemoveLineSheetProps) {
  const t = useTranslations('cart');
  const describe = useErrorMessage();
  const removeLine = useRemoveCartLine();
  // The line stays drawn while the sheet slides away after it is gone.
  const [shown, setShown] = useState(line);
  if (line && line !== shown) setShown(line);

  const close = () => {
    removeLine.reset();
    onClose();
  };

  return (
    <Sheet
      visible={line !== undefined}
      title={t('removeTitle')}
      onClose={close}
      footer={
        <SheetActions>
          <Button label={t('cancel')} variant="secondary" onPress={close} />
          <Button
            label={t('confirmRemove')}
            loading={removeLine.isPending}
            onPress={() => line && removeLine.mutate(line.key, { onSuccess: close })}
          />
        </SheetActions>
      }>
      {shown ? (
        <View className="gap-2 rounded-2xl bg-surface px-3 py-3">
          <CartLineBody line={shown}>
            <Text variant="price" className="self-end">
              {shown.lineTotal.formatted}
            </Text>
          </CartLineBody>
          {removeLine.error ? (
            <Text variant="caption" className="text-danger">
              {describe(removeLine.error)}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}
