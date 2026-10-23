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
import {
  meetsPolicy,
  usePasswordChecklist,
  usePasswordPolicy,
} from '@/features/auth/password-policy';
import { useErrorMessage } from '@/i18n/use-error-message';

import { RouteSheet } from './route-sheet';
import { useChangePassword } from './use-me';

type Field = 'current' | 'next' | 'confirm';

/** Where the store's refusal belongs: under a field, or over the form. */
const FIELD_OF_REASON: Partial<Record<string, Field>> = {
  CURRENT_PASSWORD_REQUIRED: 'current',
  CURRENT_PASSWORD_INCORRECT: 'current',
  SAME_PASSWORD: 'next',
  PASSWORD_POLICY: 'next',
};

/** The Change Password sheet, with the store's password rules under the new one. */
export function ChangePasswordSheet() {
  const t = useTranslations('security');
  const router = useRouter();
  const toast = useToast();
  const describe = useErrorMessage();
  const policy = usePasswordPolicy();
  const change = useChangePassword();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string>();
  const rules = usePasswordChecklist(next);

  const save = () => {
    const found: Partial<Record<Field, string>> = {};
    if (!current) found.current = t('currentRequired');
    if (!meetsPolicy(next, policy)) found.next = t('policyBroken');
    if (next !== confirm) found.confirm = t('mismatch');
    setErrors(found);
    setFormError(undefined);
    if (Object.keys(found).length > 0) return;

    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          toast.show({ message: t('changed') });
          router.back();
        },
        onError: (error) => {
          const field = isApiError(error) ? FIELD_OF_REASON[error.reason ?? ''] : undefined;
          if (field) setErrors({ [field]: describe(error) });
          else setFormError(describe(error));
        },
      }
    );
  };

  return (
    <RouteSheet
      title={t('changePassword')}
      footer={
        <Button
          label={t('save')}
          variant="accent"
          loading={change.isPending}
          onPress={save}
          className="self-end px-10"
        />
      }>
      <View className="gap-4">
        <Text variant="subheading">{t('passwordIntro')}</Text>
        <FormError message={formError} />
        <PasswordField
          label={t('currentPassword')}
          value={current}
          onChangeText={setCurrent}
          error={errors.current}
          autoComplete="current-password"
          textContentType="password"
        />
        <PasswordField
          label={t('newPassword')}
          value={next}
          onChangeText={setNext}
          error={errors.next}
          rules={rules}
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <PasswordField
          label={t('confirmPassword')}
          value={confirm}
          onChangeText={setConfirm}
          error={errors.confirm}
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <Text variant="caption">{t('otherDevices')}</Text>
      </View>
    </RouteSheet>
  );
}
