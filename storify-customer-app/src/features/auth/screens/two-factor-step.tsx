import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button, TextLink } from '@/components/ui/button';
import { CodeInput } from '@/components/ui/code-input';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';

import type { AuthError } from '../auth-request';
import { backupCodeSchema, TOTP_LENGTH, totpCodeSchema } from '../schemas';
import type { SignInStep, TwoFactorMethod } from '../use-sign-in';
import { FormError } from './auth-sheet';
import { errorFor, formErrorOf, useValidationMessage } from './form-messages';

type TwoFactorStepProps = {
  step: Extract<SignInStep, { name: 'twoFactor' }>;
  error: AuthError | null;
  isPending: boolean;
  verifyCode: (code: string) => Promise<void>;
  switchMethod: (method: TwoFactorMethod) => void;
};

/**
 * The second step of signing in: the authenticator's code in six
 * boxes (the Code design), or one of the saved backup codes.
 */
export function TwoFactorStep({
  step,
  error,
  isPending,
  verifyCode,
  switchMethod,
}: TwoFactorStepProps) {
  const t = useTranslations('auth');
  const validation = useValidationMessage();
  const [code, setCode] = useState('');
  const [invalid, setInvalid] = useState<string | undefined>();
  const totp = step.method === 'totp';

  const submit = async (value: string) => {
    const parsed = (totp ? totpCodeSchema : backupCodeSchema).safeParse(value);
    if (!parsed.success) {
      setInvalid(validation(parsed.error.issues[0]?.message));
      return;
    }
    setInvalid(undefined);
    await verifyCode(parsed.data);
    // A refused code is typed again from the first box.
    setCode('');
  };

  const change = (value: string) => {
    setInvalid(undefined);
    setCode(value);
  };

  const fieldError = invalid ?? errorFor(error, 'code');

  return (
    <View className="gap-5">
      <Text variant="display">{t('twoFactorTitle')}</Text>
      <Text>{totp ? t('twoFactorBody') : t('backupCodeBody')}</Text>

      {totp ? (
        <CodeInput
          on="surface"
          label={t('codeLabel')}
          required
          length={TOTP_LENGTH}
          value={code}
          onChangeText={change}
          onComplete={(value) => void submit(value)}
          error={fieldError}
          editable={!isPending}
          autoFocus
        />
      ) : (
        <TextField
          label={t('backupCodeLabel')}
          value={code}
          onChangeText={change}
          error={fieldError}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={() => void submit(code)}
          autoFocus
        />
      )}

      <FormError message={formErrorOf(error)} />

      <Button
        variant="accent"
        label={t('verify')}
        onPress={() => void submit(code)}
        loading={isPending}
      />

      {step.canUseAuthenticator ? (
        <View className="items-center">
          <TextLink
            label={totp ? t('useBackupCode') : t('useAuthenticator')}
            tone="foreground"
            underline
            onPress={() => {
              change('');
              switchMethod(totp ? 'backupCode' : 'totp');
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
