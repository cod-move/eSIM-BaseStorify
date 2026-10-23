import * as Clipboard from 'expo-clipboard';
import { openURL } from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { CodeInput } from '@/components/ui/code-input';
import { IconButton } from '@/components/ui/icon-button';
import { IconCircle } from '@/components/ui/icon-circle';
import { PasswordField } from '@/components/ui/password-field';
import { RowGroup } from '@/components/ui/rows';
import { Screen, StackHeader } from '@/components/ui/screen';
import { ConfirmSheet } from '@/components/ui/sheet';
import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useTwoFactorSettings } from '@/features/auth/use-account-security';
import { useMe } from '@/features/workspace/use-me';

const CODE_LENGTH = 6;

/** The key an authenticator app is set up with, from its link: `otpauth://totp/…?secret=ABCD…`. */
export function setupKeyOf(totpURI: string): string | null {
  const secret = /[?&]secret=([^&#]+)/i.exec(totpURI)?.[1];
  return secret ? decodeURIComponent(secret) : null;
}

/** "ABCDEFGH…" in groups of four, easier to type into another device. */
function grouped(key: string): string {
  return key.match(/.{1,4}/g)?.join(' ') ?? key;
}

/**
 * Two-step verification. Turning it on takes the
 * password, then the authenticator app (opened from its link, or set up on
 * another device with the key), then the first code; then the backup codes,
 * to keep. Turning it off takes the password.
 *
 * There is no QR code: the authenticator usually runs on this same phone,
 * which cannot scan its own screen.
 */
export function TwoStepScreen() {
  const t = useTranslations('account.twoStep');
  const me = useMe();
  const header = <StackHeader title={t('title')} icon="shield" />;
  // The backup codes, kept from the set-up to show once it is confirmed.
  const [savedCodes, setSavedCodes] = useState<string[] | null>(null);

  if (savedCodes) {
    return (
      <Screen header={header} scroll contentClassName="gap-6 px-4 pt-2">
        <BackupCodes codes={savedCodes} onDone={() => router.back()} />
      </Screen>
    );
  }

  if (!me.data) {
    return (
      <Screen header={header}>
        {me.isError ? (
          <ErrorState error={me.error} onRetry={() => void me.refetch()} />
        ) : (
          <LoadingState shape="spinner" />
        )}
      </Screen>
    );
  }

  return (
    <Screen header={header} scroll contentClassName="gap-6 px-4 pt-2">
      {me.data.twoFactorEnabled ? <TurnOff /> : <TurnOn onConfirmed={setSavedCodes} />}
    </Screen>
  );
}

function TurnOn({ onConfirmed }: { onConfirmed: (backupCodes: string[]) => void }) {
  const t = useTranslations('account.twoStep');
  const toast = useToast();
  const { setup, start, confirm, isPending, error, clearError } = useTwoFactorSettings();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [missing, setMissing] = useState(false);

  if (!setup) {
    const submit = () => {
      setMissing(password === '');
      if (password !== '') void start(password);
    };
    return (
      <>
        <View className="items-start gap-3">
          <IconCircle icon="shield" tone="warning" size="lg" />
          <Text variant="heading">{t('offTitle')}</Text>
          <Text className="text-muted">{t('offBody')}</Text>
        </View>
        <PasswordField
          label={t('password')}
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setMissing(false);
            clearError();
          }}
          error={
            missing ? t('passwordMissing') : error?.field === 'password' ? error.message : undefined
          }
          returnKeyType="go"
          onSubmitEditing={submit}
          editable={!isPending}
        />
        {error && error.field !== 'password' ? (
          <Banner tone="danger" message={error.message} />
        ) : null}
        <Button label={t('turnOn')} variant="accent" loading={isPending} onPress={submit} />
      </>
    );
  }

  const key = setupKeyOf(setup.totpURI);
  const verify = async (value = code) => {
    setMissing(value.length !== CODE_LENGTH);
    if (value.length !== CODE_LENGTH) return;
    const codes = setup.backupCodes;
    const confirmed = await confirm(value);
    if (!confirmed) {
      setCode('');
      return;
    }
    toast.show({ message: t('turnedOn'), tone: 'success' });
    onConfirmed(codes);
  };

  return (
    <>
      <View className="gap-2">
        <Text variant="heading">{t('setupTitle')}</Text>
        <Text className="text-muted">{t('setupBody')}</Text>
      </View>
      <Button
        label={t('openApp')}
        icon="external-link"
        variant="secondary"
        onPress={() => void openURL(setup.totpURI).catch(() => undefined)}
      />
      {key ? (
        <View className="gap-2">
          <Text variant="section">{t('keyLabel')}</Text>
          <RowGroup>
            <View className="min-h-14 flex-row items-center gap-3 ps-4 pe-1">
              <Text
                variant="label"
                selectable
                style={{ direction: 'ltr' }}
                className="flex-1 tracking-wider">
                {grouped(key)}
              </Text>
              <IconButton
                icon="copy"
                variant="plain"
                label={t('copyKey')}
                onPress={() => {
                  void Clipboard.setStringAsync(key);
                  toast.show({ message: t('keyCopied'), tone: 'success' });
                }}
              />
            </View>
          </RowGroup>
          <Text variant="caption">{t('keyHint')}</Text>
        </View>
      ) : null}
      <CodeInput
        label={t('codeLabel')}
        value={code}
        onChangeText={(value) => {
          setCode(value);
          setMissing(false);
          clearError();
        }}
        onComplete={(value) => void verify(value)}
        length={CODE_LENGTH}
        error={missing ? t('codeMissing') : error?.message}
        editable={!isPending}
      />
      <Button
        label={t('confirm')}
        variant="accent"
        loading={isPending}
        onPress={() => void verify()}
      />
    </>
  );
}

function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const t = useTranslations('account.twoStep');
  const toast = useToast();

  return (
    <>
      <View className="items-start gap-3">
        <IconCircle icon="check-circle" tone="success" size="lg" />
        <Text variant="heading">{t('codesTitle')}</Text>
        <Text className="text-muted">{t('codesBody')}</Text>
      </View>
      <RowGroup>
        {codes.map((code) => (
          <Text
            key={code}
            variant="label"
            selectable
            style={{ direction: 'ltr' }}
            className="px-4 py-3 tracking-wider">
            {code}
          </Text>
        ))}
      </RowGroup>
      <View className="gap-3">
        <Button
          label={t('copyCodes')}
          icon="copy"
          variant="secondary"
          onPress={() => {
            void Clipboard.setStringAsync(codes.join('\n'));
            toast.show({ message: t('codesCopied'), tone: 'success' });
          }}
        />
        <Button label={t('done')} variant="accent" onPress={onDone} />
      </View>
    </>
  );
}

function TurnOff() {
  const t = useTranslations('account.twoStep');
  const toast = useToast();
  const { disable, isPending, error, clearError } = useTwoFactorSettings();
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState('');
  const [missing, setMissing] = useState(false);

  const close = () => {
    setAsking(false);
    setPassword('');
    setMissing(false);
    clearError();
  };

  return (
    <>
      <View className="items-start gap-3">
        <IconCircle icon="shield" tone="success" size="lg" />
        <Text variant="heading">{t('onTitle')}</Text>
        <Text className="text-muted">{t('onBody')}</Text>
      </View>
      <Button
        label={t('turnOff')}
        variant="ghost"
        destructive
        onPress={() => setAsking(true)}
        className="self-start px-0"
      />
      <ConfirmSheet
        visible={asking}
        title={t('offConfirmTitle')}
        body={t('offConfirmBody')}
        confirmLabel={t('turnOff')}
        tone="danger"
        cancelLabel={t('keepOn')}
        loading={isPending}
        onCancel={close}
        onConfirm={async () => {
          setMissing(password === '');
          if (password === '') return;
          if (!(await disable(password))) return;
          close();
          toast.show({ message: t('turnedOff'), tone: 'success' });
        }}>
        <View className="gap-3">
          <PasswordField
            label={t('password')}
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setMissing(false);
              clearError();
            }}
            error={missing ? t('passwordMissing') : error?.message}
            editable={!isPending}
          />
        </View>
      </ConfirmSheet>
    </>
  );
}
