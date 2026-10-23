import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { isApiError } from '@/api/errors';
import { Button } from '@/components/ui/button';
import { PasswordField } from '@/components/ui/password-field';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { FormError } from '@/features/auth/screens/auth-sheet';
import { useErrorMessage } from '@/i18n/use-error-message';

import { RouteSheet } from './route-sheet';
import { useDeleteAccount } from './use-me';

/**
 * Delete Account: what goes and what stays, the password to confirm,
 * and a `danger` button. After the store deletes the account, this phone signs
 * out and the shopper lands on the Account tab as a guest.
 */
export function DeleteAccountSheet() {
  const t = useTranslations('security');
  const router = useRouter();
  const toast = useToast();
  const describe = useErrorMessage();
  const remove = useDeleteAccount();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ field: boolean; message: string }>();

  const confirm = () => {
    setError(undefined);
    remove.mutate(
      { password: password || undefined },
      {
        onSuccess: () => {
          toast.show({ message: t('deleted') });
          router.dismissTo('/account');
        },
        onError: (failure) => {
          const field = isApiError(failure) && failure.reason === 'PASSWORD_INCORRECT';
          setError({ field, message: describe(failure) });
        },
      }
    );
  };

  return (
    <RouteSheet
      title={t('deleteTitle')}
      footer={
        <Button
          label={t('deleteConfirm')}
          variant="danger"
          loading={remove.isPending}
          disabled={!password}
          onPress={confirm}
        />
      }>
      <View className="gap-4">
        <Text>{t('deleteBody')}</Text>
        <FormError message={error && !error.field ? error.message : undefined} />
        <PasswordField
          label={t('deletePassword')}
          hint={t('deletePasswordHint')}
          value={password}
          onChangeText={setPassword}
          error={error?.field ? error.message : undefined}
          autoComplete="current-password"
          textContentType="password"
        />
      </View>
    </RouteSheet>
  );
}
