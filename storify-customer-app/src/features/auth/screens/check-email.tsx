import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { TextLink } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

import { useResendVerificationEmail } from '../use-email-verification';
import { FormError } from './auth-sheet';

/**
 * "Check your email" (by link while the store sends one): the address
 * in bold, "Change email address", and "Send a new link" after a pause.
 */
export function CheckEmail({ email, onChangeEmail }: { email: string; onChangeEmail: () => void }) {
  const t = useTranslations('auth');
  const { resend, sent, isPending, error, secondsLeft } = useResendVerificationEmail(email);

  return (
    <View className="gap-5">
      <Text variant="display">{t('checkEmailTitle')}</Text>
      <View className="items-start gap-2">
        <Text>
          {t.rich('checkEmailBody', {
            email,
            b: (chunks) => <Text className="font-semibold">{chunks}</Text>,
          })}
        </Text>
        <TextLink label={t('changeEmail')} onPress={onChangeEmail} />
      </View>

      {sent ? (
        <Text variant="caption" className="text-success" accessibilityLiveRegion="polite">
          {t('linkSent')}
        </Text>
      ) : null}
      <FormError message={error?.message} />

      <View className="items-start">
        <TextLink
          label={secondsLeft > 0 ? t('resendIn', { seconds: secondsLeft }) : t('resendLink')}
          tone="foreground"
          underline
          disabled={secondsLeft > 0 || isPending}
          onPress={resend}
        />
      </View>
    </View>
  );
}
