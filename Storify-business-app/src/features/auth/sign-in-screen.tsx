import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View, type TextInput } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { useTranslations } from 'use-intl';

import { Banner } from '@/components/ui/banner';
import { Button, TextLink } from '@/components/ui/button';
import { CodeInput } from '@/components/ui/code-input';
import { PasswordField } from '@/components/ui/password-field';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { env } from '@/config/env';
import { useConfig } from '@/features/config/use-config';
import { joinWebsiteUrl } from '@/lib/links';

import { AuthPanel } from './auth-panel';
import { useSignIn } from './use-sign-in';

/** The length of an authenticator's code. */
const CODE_LENGTH = 6;
/** How long the session may take to arrive after the store said yes, before the screen says so. */
const SESSION_WAIT_MS = 10_000;

/**
 * Signing in: the whole screen, as nothing works before
 * it, drawn as the shopper app's sign-in sheet (`AuthPanel`). Email and
 * password, then the second step when the account has two-step verification.
 * A refusal is a banner above the button; a field's own error sits under the
 * field. The screen never navigates after signing in: the root layout follows
 * the session.
 */
export function SignInScreen() {
  const t = useTranslations('signIn');
  const { step, isPending, error, signIn, verifyCode, switchMethod, restart } = useSignIn();

  return (
    <AuthPanel title={t('submit')} onBack={step.name === 'twoFactor' ? restart : undefined}>
      {step.name === 'signedIn' ? (
        <SigningIn onRestart={restart} />
      ) : step.name === 'twoFactor' ? (
        <TwoFactorStep
          key={step.method}
          email={step.email}
          method={step.method}
          canUseAuthenticator={step.canUseAuthenticator}
          isPending={isPending}
          error={error}
          onVerify={(code) => void verifyCode(code)}
          onSwitch={switchMethod}
        />
      ) : (
        <CredentialsStep
          isPending={isPending}
          error={error}
          onSubmit={(values) => void signIn(values)}
        />
      )}
    </AuthPanel>
  );
}

type AuthError = ReturnType<typeof useSignIn>['error'];

/**
 * The store said yes; the session is on its way, and the root layout opens the
 * app the moment it is here. Should it never come, the operator is told and
 * can start again.
 */
function SigningIn({ onRestart }: { onRestart: () => void }) {
  const t = useTranslations('signIn');
  const tCommon = useTranslations('common');
  const muted = useCSSVariable('--color-muted');
  const [late, setLate] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setLate(true), SESSION_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View className="flex-1 justify-center gap-4">
      {late ? (
        <>
          <Banner tone="danger" message={t('sessionMissing')} />
          <Button label={tCommon('retry')} variant="secondary" onPress={onRestart} />
        </>
      ) : (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t('signingIn')}
          className="items-center gap-3">
          <ActivityIndicator color={muted ? String(muted) : undefined} />
          <Text className="text-center text-muted">{t('signingIn')}</Text>
        </View>
      )}
    </View>
  );
}

type CredentialsStepProps = {
  isPending: boolean;
  error: AuthError;
  onSubmit: (values: { email: string; password: string }) => void;
};

function CredentialsStep({ isPending, error, onSubmit }: CredentialsStepProps) {
  const t = useTranslations('signIn');
  const config = useConfig();
  const password = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [secret, setSecret] = useState('');
  const [missing, setMissing] = useState<{ email?: boolean; password?: boolean }>({});

  const submit = () => {
    const gaps = { email: email.trim() === '', password: secret === '' };
    setMissing(gaps);
    if (gaps.email || gaps.password) return;
    onSubmit({ email, password: secret });
  };

  const fieldError = (field: 'email' | 'password') =>
    error?.field === field ? error.message : undefined;
  const formError = error && error.field !== 'email' && error.field !== 'password' ? error : null;

  return (
    <>
      <View className="gap-2">
        <Text variant="display" accessibilityRole="header">
          {t('title')}
        </Text>
        <Text className="text-muted">{t('body', { store: config.data?.store.name ?? '' })}</Text>
      </View>

      <View className="gap-5">
        <TextField
          label={t('email')}
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            setMissing((gaps) => ({ ...gaps, email: false }));
          }}
          error={missing.email ? t('emailMissing') : fieldError('email')}
          placeholder={t('emailPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="username"
          keyboardType="email-address"
          inputMode="email"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => password.current?.focus()}
          editable={!isPending}
        />
        <PasswordField
          ref={password}
          label={t('password')}
          value={secret}
          onChangeText={(text) => {
            setSecret(text);
            setMissing((gaps) => ({ ...gaps, password: false }));
          }}
          error={missing.password ? t('passwordMissing') : fieldError('password')}
          placeholder={t('passwordPlaceholder')}
          returnKeyType="go"
          onSubmitEditing={submit}
          editable={!isPending}
        />
        <View className="-mt-2 flex-row justify-end">
          <TextLink
            label={t('forgot')}
            accessibilityHint={t('forgotHint')}
            disabled={isPending}
            onPress={() =>
              router.push({ pathname: '/forgot-password', params: { email: email.trim() } })
            }
          />
        </View>
      </View>

      <View className="gap-4">
        {formError ? <Banner tone="danger" message={formError.message} /> : null}
        <Button label={t('submit')} variant="accent" loading={isPending} onPress={submit} />
      </View>

      {env.apiMock ? <Text variant="caption">{t('mockHint')}</Text> : null}
      <BecomeSeller />
    </>
  );
}

/**
 * The shopper app's "Haven't signed up yet? Create an account", as it applies
 * here: nobody signs up in this app (the store adds its team), but on a store
 * with sellers a shop can apply, on the website's seller page.
 */
function BecomeSeller() {
  const t = useTranslations('signIn');
  const config = useConfig().data;
  if (!config?.features.multiVendor) return null;
  const page = joinWebsiteUrl(config.store.websiteUrl, 'become-vendor');

  return (
    <View className="items-center gap-1 pt-2">
      <Text variant="subheading" className="text-center">
        {t('sellerQuestion', { store: config.store.name })}
      </Text>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={t('sellerAction')}
        onPress={() => void WebBrowser.openBrowserAsync(page)}
        hitSlop={12}
        className="min-h-11 justify-center active:opacity-70">
        <Text variant="subheading" className="text-center text-link underline">
          {t('sellerAction')}
        </Text>
      </Pressable>
    </View>
  );
}

type TwoFactorStepProps = {
  email: string;
  method: 'totp' | 'backupCode';
  canUseAuthenticator: boolean;
  isPending: boolean;
  error: AuthError;
  onVerify: (code: string) => void;
  onSwitch: (method: 'totp' | 'backupCode') => void;
};

function TwoFactorStep({
  email,
  method,
  canUseAuthenticator,
  isPending,
  error,
  onVerify,
  onSwitch,
}: TwoFactorStepProps) {
  const t = useTranslations('signIn.twoFactor');
  const [code, setCode] = useState('');
  const [missing, setMissing] = useState(false);
  const [seenError, setSeenError] = useState(error);
  const totp = method === 'totp';

  // A refused code is cleared, so the next one is typed into empty boxes.
  if (error !== seenError) {
    setSeenError(error);
    if (error) setCode('');
  }

  const submit = (value = code) => {
    const ready = totp ? value.length === CODE_LENGTH : value.trim() !== '';
    setMissing(!ready);
    if (ready) onVerify(value);
  };

  const codeError = missing
    ? totp
      ? t('codeMissing')
      : t('backupMissing')
    : error?.field === 'code'
      ? error.message
      : undefined;
  const formError = error && error.field !== 'code' ? error : null;

  return (
    <>
      <View className="gap-2">
        <Text variant="display" accessibilityRole="header">
          {t('title')}
        </Text>
        <Text className="text-muted">{totp ? t('bodyApp') : t('bodyBackup')}</Text>
        <Text variant="label">{email}</Text>
      </View>

      {totp ? (
        <CodeInput
          label={t('codeLabel')}
          value={code}
          onChangeText={(next) => {
            setCode(next);
            setMissing(false);
          }}
          onComplete={submit}
          length={CODE_LENGTH}
          error={codeError}
          editable={!isPending}
          autoFocus
        />
      ) : (
        <TextField
          label={t('backupLabel')}
          value={code}
          onChangeText={(next) => {
            setCode(next);
            setMissing(false);
          }}
          error={codeError}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="go"
          onSubmitEditing={() => submit()}
          editable={!isPending}
          autoFocus
        />
      )}

      <View className="gap-4">
        {formError ? <Banner tone="danger" message={formError.message} /> : null}
        <Button label={t('verify')} variant="accent" loading={isPending} onPress={() => submit()} />
        {totp ? (
          <Button
            label={t('useBackup')}
            variant="ghost"
            disabled={isPending}
            onPress={() => onSwitch('backupCode')}
          />
        ) : canUseAuthenticator ? (
          <Button
            label={t('useApp')}
            variant="ghost"
            disabled={isPending}
            onPress={() => onSwitch('totp')}
          />
        ) : null}
      </View>
    </>
  );
}
