import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { PasswordField } from '@/components/ui/password-field';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';

import { usePasswordChecklist } from '../password-policy';
import type { SignUpValues } from '../schemas';
import { useSignIn } from '../use-sign-in';
import { useSignUp } from '../use-sign-up';
import { AuthSheet, FormError, SwitchLine } from './auth-sheet';
import { CheckEmail } from './check-email';
import { errorFor, formErrorOf, useValidationMessage } from './form-messages';
import { GoogleSignIn } from './google-sign-in';
import { SigningIn } from './signing-in';
import { TwoFactorStep } from './two-factor-step';

/**
 * Create account, with the store's password rules ticking under the
 * password, then "check your email" when the store wants it confirmed. Or
 * "Continue with Google", which creates the account (Google has confirmed the
 * email) or signs in to the one the email already has.
 */
export function SignUpScreen() {
  const t = useTranslations('auth');
  const router = useRouter();
  const validation = useValidationMessage();
  const { step, isPending, error, signUp, changeEmail, schema } = useSignUp();
  // "Continue with Google" signs in, or creates the account when the email is
  // new: the sign-in's steps, two-step code included, for an existing account.
  const google = useSignIn();

  const { control, handleSubmit } = useForm<SignUpValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', password: '' },
  });
  const password = useWatch({ control, name: 'password' });
  const rules = usePasswordChecklist(password);
  const submit = handleSubmit(signUp);

  const signedIn =
    step.name === 'signedIn'
      ? step.user
      : google.step.name === 'signedIn'
        ? google.step.user
        : null;
  if (signedIn) {
    return (
      <AuthSheet title={t('welcome')}>
        <SigningIn user={signedIn} />
      </AuthSheet>
    );
  }
  if (google.step.name === 'twoFactor') {
    return (
      <AuthSheet title={t('signIn')} onBack={google.restart}>
        <TwoFactorStep
          step={google.step}
          error={google.error}
          isPending={google.isPending}
          verifyCode={google.verifyCode}
          switchMethod={google.switchMethod}
        />
      </AuthSheet>
    );
  }
  if (step.name === 'verifyEmail') {
    return (
      <AuthSheet title={t('signUpTitle')} onBack={changeEmail}>
        <CheckEmail email={step.email} onChangeEmail={changeEmail} />
      </AuthSheet>
    );
  }

  return (
    <AuthSheet title={t('signUpTitle')}>
      <View className="gap-5">
        <Text variant="display">{t('getStarted')}</Text>
        <Controller
          control={control}
          name="name"
          render={({ field, fieldState }) => (
            <TextField
              label={t('name')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={validation(fieldState.error?.message) ?? errorFor(error, 'name')}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
            />
          )}
        />
        <Controller
          control={control}
          name="email"
          render={({ field, fieldState }) => (
            <TextField
              label={t('email')}
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
        <Controller
          control={control}
          name="password"
          render={({ field, fieldState }) => (
            <PasswordField
              label={t('password')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={validation(fieldState.error?.message) ?? errorFor(error, 'password')}
              rules={rules}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={submit}
            />
          )}
        />

        <Text variant="caption">{t('terms')}</Text>
        <FormError message={formErrorOf(error)} />

        <Button variant="accent" label={t('signUp')} onPress={submit} loading={isPending} />

        <GoogleSignIn
          onResult={google.signInWithGoogle}
          loading={google.pendingMethod === 'google'}
        />
        <FormError message={formErrorOf(google.error)} />

        <SwitchLine
          question={t('haveAccount')}
          action={t('signIn')}
          onPress={() => router.replace('/login')}
        />
      </View>
    </AuthSheet>
  );
}
