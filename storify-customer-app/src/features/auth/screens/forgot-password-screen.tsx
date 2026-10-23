import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button, TextLink } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';

import { forgotPasswordSchema, type ForgotPasswordValues } from '../schemas';
import { useForgotPassword } from '../use-forgot-password';
import { AuthSheet, FormError } from './auth-sheet';
import { errorFor, formErrorOf, useValidationMessage } from './form-messages';

/**
 * Forgot password: the shopper's email, then "check your email". The
 * link in the email opens the store's website, where the new password is chosen.
 */
export function ForgotPasswordScreen() {
  const t = useTranslations('auth');
  const router = useRouter();
  const validation = useValidationMessage();
  const { request, sentTo, isPending, error, secondsLeft, reset } = useForgotPassword();

  const { control, handleSubmit } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });
  const submit = handleSubmit(({ email }) => request(email));
  const backToSignIn = () => (router.canGoBack() ? router.back() : router.replace('/login'));

  if (sentTo) {
    return (
      <AuthSheet title={t('forgotTitle')} onBack={reset}>
        <View className="gap-5">
          <Text variant="display">{t('checkEmailTitle')}</Text>
          <View className="items-start gap-2">
            <Text>
              {t.rich('resetSentBody', {
                email: sentTo,
                b: (chunks) => <Text className="font-semibold">{chunks}</Text>,
              })}
            </Text>
            <TextLink label={t('changeEmail')} onPress={reset} />
          </View>
          <FormError message={error?.message} />
          <View className="items-start">
            <TextLink
              label={secondsLeft > 0 ? t('resendIn', { seconds: secondsLeft }) : t('resendLink')}
              tone="foreground"
              underline
              disabled={secondsLeft > 0 || isPending}
              onPress={() => void request(sentTo)}
            />
          </View>
          <Button variant="accent" label={t('backToSignIn')} onPress={backToSignIn} />
        </View>
      </AuthSheet>
    );
  }

  return (
    <AuthSheet title={t('forgotTitle')}>
      <View className="gap-5">
        <Text>{t('forgotBody')}</Text>
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
              returnKeyType="send"
              onSubmitEditing={submit}
            />
          )}
        />
        <FormError message={formErrorOf(error)} />
        <Button variant="accent" label={t('sendLink')} onPress={submit} loading={isPending} />
        <View className="items-center">
          <TextLink label={t('backToSignIn')} onPress={backToSignIn} />
        </View>
      </View>
    </AuthSheet>
  );
}
