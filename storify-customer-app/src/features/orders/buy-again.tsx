import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import type { OrderLine } from '@/contracts/mobile/shop/v1';
import { useErrorMessage } from '@/i18n/use-error-message';

import { useBuyAgain } from './use-buy-again';

/**
 * "Buy again": puts the order's lines in the cart at their quantities. The
 * lines the store refuses are listed with its reason before the cart opens.
 */
export function BuyAgain({ lines }: { lines: OrderLine[] }) {
  const t = useTranslations('orders');
  const describe = useErrorMessage();
  const toast = useToast();
  const { run, refused, openCart, isPending } = useBuyAgain(lines);

  if (lines.length === 0) return null;

  return (
    <>
      <Button
        label={t('buyAgain')}
        loading={isPending}
        onPress={() => run().catch((error: unknown) => toast.show({ message: describe(error) }))}
      />
      <Sheet
        visible={refused.length > 0}
        title={t('buyAgainRefusedTitle')}
        onClose={openCart}
        footer={<Button label={t('viewCart')} onPress={openCart} />}>
        <View className="gap-3">
          {refused.map(({ line, error }) => (
            <View key={line.index} className="gap-0.5">
              <Text variant="product" numberOfLines={2}>
                {line.name}
              </Text>
              <Text variant="caption" className="text-danger">
                {describe(error)}
              </Text>
            </View>
          ))}
        </View>
      </Sheet>
    </>
  );
}
