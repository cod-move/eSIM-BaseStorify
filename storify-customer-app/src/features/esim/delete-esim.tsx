import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';

import { useDeleteEsim } from './use-esims';

/**
 * "Delete eSIM" and the sheet that asks first: the eSIM leaves the shopper's
 * list (website and app). Nothing is cancelled or refunded, and an installed
 * eSIM keeps working. Afterwards the screen goes back to where it came from.
 */
export function DeleteEsim({ id }: { id: string }) {
  const t = useTranslations('esim');
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const remove = useDeleteEsim(id);

  return (
    <>
      <Button label={t('deleteButton')} variant="ghost" onPress={() => setOpen(true)} />
      <Sheet
        visible={open}
        title={t('deleteTitle')}
        onClose={() => setOpen(false)}
        footer={
          <View className="gap-3">
            <Button
              label={t('deleteConfirm')}
              variant="danger"
              loading={remove.isPending}
              onPress={() =>
                remove.mutate(undefined, {
                  onSuccess: () => {
                    setOpen(false);
                    toast.show({ message: t('deleteDone') });
                    if (router.canGoBack()) router.back();
                    else router.replace('/account/esims');
                  },
                  onError: () => {
                    setOpen(false);
                    toast.show({ message: t('deleteFailed') });
                  },
                })
              }
            />
            <Button label={t('deleteKeep')} variant="secondary" onPress={() => setOpen(false)} />
          </View>
        }>
        <Text className="text-muted">{t('deleteBody')}</Text>
      </Sheet>
    </>
  );
}
