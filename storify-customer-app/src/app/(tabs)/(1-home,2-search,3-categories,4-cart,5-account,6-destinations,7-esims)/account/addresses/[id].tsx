import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { AddressForm } from '@/features/addresses/address-form';
import { useAddresses } from '@/features/addresses/use-addresses';

export default function EditAddressScreen() {
  const t = useTranslations('addresses');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const book = useAddresses();

  const header = <Stack.Screen options={{ title: t('editTitle') }} />;
  if (book.isPending) return <LoadingState />;
  if (book.isError) return <ErrorState error={book.error} onRetry={() => void book.refetch()} />;

  const address = book.data.find((a) => a.id === id);
  return (
    <View className="flex-1 bg-background">
      {header}
      {address ? (
        <AddressForm address={address} onSaved={() => router.back()} />
      ) : (
        <EmptyState icon="pin" title={t('notFound')} />
      )}
    </View>
  );
}
