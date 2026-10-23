import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button, TextLink } from '@/components/ui/button';
import { PasswordField } from '@/components/ui/password-field';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { env } from '@/config/env';

import { signInSchema, type SignInValues } from '../schemas';
import { useSignIn } from '../use-sign-in';
import { AuthSheet, FormError, SwitchLine } from './auth-sheet';
import { CheckEmail } from './check-email';
import { errorFor, formErrorOf, useValidationMessage } from './form-messages';
import { GoogleSignIn } from './google-sign-in';
import { SigningIn } from './signing-in';
import { TwoFactorStep } from './two-factor-step';

/**
 * Sign in, with email and password or with Google, then the step the store
 * asks for: the two-step code, "check your email", or the hand-off while the
 * app finishes. The form keeps what was typed while another step shows.
 */
export function SignInScreen() {
  const t = useTranslations('auth');
  const router = useRouter();
  const validation = useValidationMessage();
  const {
    step,
    isPending,
    pendingMethod,
    error,
    signIn,
    signInWithGoogle,
    verifyCode,
    switchMethod,
    restart,
  } = useSignIn();

  const { control, handleSubmit } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });
  const submit = handleSubmit(signIn);

  if (step.name === 'signedIn') {
    return (
      <AuthSheet title={t('welcome')}>
        <SigningIn user={step.user} />
      </AuthSheet>
    );
  }
  if (step.name === 'twoFactor') {
    return (
      <AuthSheet title={t('signIn')} onBack={restart}>
        <TwoFactorStep
          step={step}
          error={error}
          isPending={isPending}
          verifyCode={verifyCode}
          switchMethod={switchMethod}
        />
      </AuthSheet>
    );
  }
  if (step.name === 'verifyEmail') {
    return (
      <AuthSheet title={t('signIn')} onBack={restart}>
        <CheckEmail email={step.email} onChangeEmail={restart} />
      </AuthSheet>
    );
  }

  return (
    <AuthSheet title={t('signIn')}>
      <View className="gap-5">
        <Text variant="display">{t('welcomeBack')}</Text>
        <Controller
          control={control}
          name="email"
          render={({ field, fieldState }) => (
            <TextField
              label={t('email')}
              placeholder={t('emailPlaceholder')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={validation(fieldState.error?.message) ?? errorFor(error, 'email')}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
            />
          )}
        />
        <View className="gap-3">
          <Controller
            control={control}
            name="password"
            render={({ field, fieldState }) => (
              <PasswordField
                label={t('password')}
                placeholder={t('passwordPlaceholder')}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={validation(fieldState.error?.message) ?? errorFor(error, 'password')}
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={submit}
              />
            )}
          />
          <View className="items-end">
            <TextLink label={t('forgotPassword')} onPress={() => router.push('/forgot-password')} />
          </View>
        </View>

        <FormError message={formErrorOf(error)} />

        <Button
          variant="accent"
          label={t('signIn')}
          onPress={submit}
          loading={pendingMethod === 'password'}
        />

        <GoogleSignIn onResult={signInWithGoogle} loading={pendingMethod === 'google'} />

        {env.apiMock ? <Text variant="caption">{t('mockHint')}</Text> : null}

        <SwitchLine
          question={t('noAccount')}
          action={t('createAccount')}
          onPress={() => router.replace('/register')}
        />
      </View>
    </AuthSheet>
  );
}
