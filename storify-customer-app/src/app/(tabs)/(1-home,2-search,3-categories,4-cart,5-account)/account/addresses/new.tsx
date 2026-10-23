import { Stack, useRouter } from 'expo-router';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { AddressForm } from '@/features/addresses/address-form';

export default function NewAddressScreen() {
  const t = useTranslations('addresses');
  const router = useRouter();

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: t('newTitle') }} />
      <AddressForm onSaved={() => router.back()} />
    </View>
  );
}
