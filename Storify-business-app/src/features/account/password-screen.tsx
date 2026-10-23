import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { PasswordField } from '@/components/ui/password-field';
import { Screen, StackHeader } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useChangePassword } from '@/features/auth/use-account-security';
import { useConfig } from '@/features/config/use-config';

import { passwordRules } from './password-rules';

/**
 * Changing the password: the current one, the new one with the store's rules
 * ticking as it is typed, and the new one again. Every other device signed in
 * to the account is signed out; this one stays.
 */
export function PasswordScreen() {
  const t = useTranslations('account.password');
  const config = useConfig();
  const toast = useToast();
  const { changePassword, isPending, error, clearError } = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [checked, setChecked] = useState(false);

  const rules = passwordRules(config.data?.auth.passwordPolicy, next);
  const missingCurrent = checked && current === '';
  const weak = checked && rules.some((rule) => !rule.met);
  const mismatch = checked && repeat !== next;

  const submit = async () => {
    setChecked(true);
    if (current === '' || rules.some((rule) => !rule.met) || repeat !== next) return;
    const changed = await changePassword({ currentPassword: current, newPassword: next });
    if (!changed) return;
    toast.show({ message: t('changed'), tone: 'success' });
    router.back();
  };

  const edit = (set: (value: string) => void) => (value: string) => {
    set(value);
    if (error) clearError();
  };

  return (
    <Screen
      header={<StackHeader title={t('title')} icon="lock" />}
      scroll
      contentClassName="gap-6 px-4 pt-2">
      <View className="gap-2">
        <Text variant="display" accessibilityRole="header">
          {t('heading')}
        </Text>
        <Text className="text-muted">{t('body')}</Text>
      </View>
      <View className="gap-4">
        <PasswordField
          label={t('current')}
          value={current}
          onChangeText={edit(setCurrent)}
          error={
            missingCurrent
              ? t('currentMissing')
              : error?.field === 'password'
                ? error.message
                : undefined
          }
          editable={!isPending}
        />
        <PasswordField
          label={t('new')}
          value={next}
          onChangeText={edit(setNext)}
          autoComplete="new-password"
          textContentType="newPassword"
          error={weak ? t('weak') : error?.field === 'newPassword' ? error.message : undefined}
          rules={rules.map((rule) => ({
            label: t(`rules.${rule.kind}`, { count: rule.count ?? 0 }),
            met: rule.met,
          }))}
          editable={!isPending}
        />
        <PasswordField
          label={t('repeat')}
          value={repeat}
          onChangeText={edit(setRepeat)}
          autoComplete="new-password"
          textContentType="newPassword"
          error={mismatch ? t('mismatch') : undefined}
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          editable={!isPending}
        />
      </View>
      <View className="gap-4">
        {error && error.field !== 'password' && error.field !== 'newPassword' ? (
          <Banner tone="danger" message={error.message} />
        ) : null}
        <Button
          label={t('save')}
          variant="accent"
          loading={isPending}
          onPress={() => void submit()}
        />
      </View>
    </Screen>
  );
}
