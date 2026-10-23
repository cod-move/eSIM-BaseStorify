import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Text } from '@/components/ui/text';
import { ContactMessageRequest } from '@/contracts/mobile/shop/v1';
import { useErrorMessage } from '@/i18n/use-error-message';

import { useSendContactMessage } from './use-content';

const FIELDS = ['name', 'email', 'phone', 'company', 'subject', 'message'] as const;
type Field = (typeof FIELDS)[number];
type Values = Record<Field, string>;

const EMPTY: Values = { name: '', email: '', phone: '', company: '', subject: '', message: '' };
const OPTIONAL: readonly Field[] = ['phone', 'company'];

/**
 * The store's contact form, checked by the contract's own rules before it is
 * sent, then sent once (`useSendContactMessage`). A signed-in shopper is told
 * the answer comes to their inbox.
 */
export function ContactForm() {
  const t = useTranslations('contact');
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const send = useSendContactMessage();
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  const submit = () => {
    const body = Object.fromEntries(
      FIELDS.flatMap((field) => {
        const value = values[field].trim();
        return OPTIONAL.includes(field) && !value ? [] : [[field, value]];
      })
    );
    const parsed = ContactMessageRequest.safeParse(body);
    if (!parsed.success) {
      const found: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as Field;
        found[field] ??= t(`errors.${field}`);
      }
      setErrors(found);
      return;
    }
    setErrors({});
    send.mutate(parsed.data, { onSuccess: () => setValues(EMPTY) });
  };

  if (send.isSuccess) {
    const conversationId = send.data.conversationId;
    return (
      <View className="gap-3 rounded-2xl bg-surface p-5">
        <Text variant="subheading" accessibilityRole="alert">
          {t('sentTitle')}
        </Text>
        <Text variant="body" className="text-muted">
          {conversationId ? t('sentInbox') : t('sentEmail')}
        </Text>
        {conversationId ? (
          <Button
            label={t('openInbox')}
            variant="outline"
            onPress={() =>
              router.push({ pathname: '/account/inbox', params: { conversation: conversationId } })
            }
          />
        ) : null}
        <Button label={t('another')} variant="ghost" onPress={() => send.reset()} />
      </View>
    );
  }

  return (
    <View className="gap-4">
      {FIELDS.map((field) => (
        <TextField
          key={field}
          label={t(`fields.${field}`)}
          value={values[field]}
          onChangeText={(value) => setValues((current) => ({ ...current, [field]: value }))}
          error={errors[field]}
          optional={OPTIONAL.includes(field)}
          editable={!send.isPending}
          keyboardType={
            field === 'email' ? 'email-address' : field === 'phone' ? 'phone-pad' : 'default'
          }
          autoCapitalize={field === 'email' ? 'none' : 'sentences'}
          multiline={field === 'message'}
          inputClassName={field === 'message' ? 'min-h-32' : undefined}
        />
      ))}
      {send.isError ? (
        <Text variant="body" className="text-danger" accessibilityRole="alert">
          {errorMessage(send.error)}
        </Text>
      ) : null}
      <Button label={t('send')} icon="mail" loading={send.isPending} onPress={submit} />
    </View>
  );
}
