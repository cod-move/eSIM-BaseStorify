import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/state-view';

import { useReceipt, type ReceiptSource } from './use-receipt';

/** "View e-receipt": downloads the invoice and opens it; a failure shows the error state. */
export function ReceiptButton({ source }: { source: ReceiptSource }) {
  const t = useTranslations('orders');
  const receipt = useReceipt(source);

  return (
    <View className="gap-3">
      <Button
        label={t('viewReceipt')}
        variant="outline"
        loading={receipt.isPending}
        onPress={() => receipt.mutate()}
      />
      {receipt.isError ? (
        <ErrorState error={receipt.error} onRetry={() => receipt.mutate()} />
      ) : null}
    </View>
  );
}
