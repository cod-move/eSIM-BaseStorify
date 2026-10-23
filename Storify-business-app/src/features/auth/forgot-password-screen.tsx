import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Banner } from '@/components/ui/banner';
import { Button, TextLink } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';

import { AuthPanel } from './auth-panel';
import { useForgotPassword } from './use-forgot-password';

/**
 * Forgot password, as the sign-in screen: the operator's email (what they
 * typed on sign-in), then "check your email". The link in the email opens the store's website, where the new
 * password is chosen; the app sends nobody to a website itself.
 */
export function ForgotPasswordScreen({ initialEmail = '' }: { initialEmail?: string }) {
  const t = useTranslations('forgotPassword');
  const { request, sentTo, isPending, error, secondsLeft, reset } = useForgotPassword();
  const [email, setEmail] = useState(initialEmail);
  const [missing, setMissing] = useState(false);

  const submit = () => {
    const empty = email.trim() === '';
    setMissing(empty);
    if (!empty) void request(email);
  };
  const backToSignIn = () => (router.canGoBack() ? router.back() : router.replace('/sign-in'));
  const fieldError = missing
    ? t('emailMissing')
    : error?.field === 'email'
      ? error.message
      : undefined;
  const formError = error && error.field !== 'email' ? error : null;

  return (
    <AuthPanel title={t('header')} onBack={sentTo ? reset : backToSignIn}>
      {sentTo ? (
        <>
          <View className="gap-2">
            <Text variant="display" accessibilityRole="header">
              {t('sentTitle')}
            </Text>
            <Text className="text-muted">{t('sentBody')}</Text>
            <Text variant="label">{sentTo}</Text>
          </View>
          <View className="items-start gap-4">
            <TextLink label={t('changeEmail')} onPress={reset} />
            <TextLink
              label={secondsLeft > 0 ? t('resendIn', { seconds: secondsLeft }) : t('resend')}
              tone="foreground"
              disabled={secondsLeft > 0 || isPending}
              onPress={() => void request(sentTo)}
            />
          </View>
          <View className="gap-4">
            {formError ? <Banner tone="danger" message={formError.message} /> : null}
            <Button label={t('backToSignIn')} variant="accent" onPress={backToSignIn} />
          </View>
        </>
      ) : (
        <>
          <View className="gap-2">
            <Text variant="display" accessibilityRole="header">
              {t('title')}
            </Text>
            <Text className="text-muted">{t('body')}</Text>
          </View>
          <TextField
            label={t('email')}
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setMissing(false);
            }}
            error={fieldError}
            placeholder={t('emailPlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="username"
            keyboardType="email-address"
            inputMode="email"
            returnKeyType="send"
            submitBehavior="submit"
            onSubmitEditing={submit}
            editable={!isPending}
            autoFocus
          />
          <View className="gap-4">
            {formError ? <Banner tone="danger" message={formError.message} /> : null}
            <Button label={t('submit')} variant="accent" loading={isPending} onPress={submit} />
          </View>
        </>
      )}
    </AuthPanel>
  );
}
