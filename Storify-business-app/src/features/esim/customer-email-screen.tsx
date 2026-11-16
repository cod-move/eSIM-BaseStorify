import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { RowGroup, ValueRow } from '@/components/ui/rows';
import { Screen, StackHeader } from '@/components/ui/screen';
import { InlineError, LoadingState } from '@/components/ui/state-view';
import { StatusChip, type StatusTone } from '@/components/ui/status-chip';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import {
  CUSTOMER_EMAIL_MESSAGE_MAX,
  CUSTOMER_EMAIL_SUBJECT_MAX,
  type CustomerEmail,
} from '@/contracts/mobile/biz/v1/esim';
import { useCustomer } from '@/features/customers/use-customers';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useDateTime } from '@/i18n/use-list-time';

import { useCustomerEmails, useEsimAccess, useSendCustomerEmail } from './use-esim';

const STATUS_TONES: Record<string, StatusTone> = {
  sent: 'success',
  queued: 'info',
  sending: 'info',
  retrying: 'warning',
  failed: 'danger',
  cancelled: 'neutral',
  unconfigured: 'danger',
};

/**
 * A plain-text email to one customer, to the address the store has for them
 * (the website's Customers → Send email), then the emails already written to
 * them with how each one went. Sent once per tap.
 */
export function CustomerEmailScreen({ id }: { id: string }) {
  const t = useTranslations('esim.email');
  const customer = useCustomer(id).data;
  const { view, manage } = useEsimAccess();
  const emails = useCustomerEmails(id, view);
  const send = useSendCustomerEmail(id);
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const ready = subject.trim().length > 0 && message.trim().length > 0;

  const submit = async () => {
    try {
      await send.mutateAsync({ subject: subject.trim(), message: message.trim() });
      setSubject('');
      setMessage('');
      toast.show({ message: t('sent'), tone: 'success' });
    } catch (error) {
      toast.show({ message: errorMessage(error), tone: 'danger' });
    }
  };

  return (
    <Screen
      header={<StackHeader title={t('title')} icon="mail" />}
      scroll
      contentClassName="gap-4 px-4 pt-2">
      {customer ? (
        <RowGroup>
          <ValueRow label={t('to')} value={customer.email ?? t('noEmail')} />
        </RowGroup>
      ) : null}

      {manage && customer?.email ? (
        <View className="gap-3">
          <TextField
            label={t('subject')}
            value={subject}
            onChangeText={setSubject}
            maxLength={CUSTOMER_EMAIL_SUBJECT_MAX}
            required
          />
          <TextField
            label={t('message')}
            hint={t('messageHint')}
            value={message}
            onChangeText={setMessage}
            maxLength={CUSTOMER_EMAIL_MESSAGE_MAX}
            multiline
            textAlignVertical="top"
            inputClassName="min-h-[180px]"
            required
          />
          <Button
            label={t('send')}
            icon="mail"
            loading={send.isPending}
            disabled={!ready}
            onPress={() => void submit()}
          />
        </View>
      ) : null}

      <EmailHistory query={emails} />
    </Screen>
  );
}

function EmailHistory({ query }: { query: ReturnType<typeof useCustomerEmails> }) {
  const t = useTranslations('esim');
  if (query.isPending) return <LoadingState shape="rows" rows={2} />;
  if (query.isError && !query.data)
    return <InlineError error={query.error} onRetry={() => void query.refetch()} />;
  const items = query.data?.items ?? [];
  return (
    <RowGroup title={t('customer.emails')}>
      {items.length ? (
        items.map((email) => <EmailRow key={email.id} email={email} />)
      ) : (
        <Text variant="meta" className="px-4 py-3">
          {t('customer.noEmails')}
        </Text>
      )}
    </RowGroup>
  );
}

function EmailRow({ email }: { email: CustomerEmail }) {
  const t = useTranslations('esim.email');
  const when = useDateTime();
  const known = [
    'queued',
    'sending',
    'retrying',
    'sent',
    'failed',
    'cancelled',
    'unconfigured',
  ] as const;
  const status = (known as readonly string[]).includes(email.status)
    ? t(`statuses.${email.status as (typeof known)[number]}`)
    : email.status;
  return (
    <View className="gap-1 px-4 py-3">
      <View className="flex-row items-start gap-2">
        <Text variant="label" className="flex-1" numberOfLines={2}>
          {email.subject}
        </Text>
        <StatusChip tone={STATUS_TONES[email.status] ?? 'neutral'} label={status} />
      </View>
      <Text variant="caption">
        {[
          when(email.sentAt ?? email.createdAt),
          email.sentBy ? t('by', { name: email.sentBy }) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      <Text variant="meta" numberOfLines={4}>
        {email.message}
      </Text>
      {email.error ? (
        <Text variant="meta" className="text-danger">
          {email.error}
        </Text>
      ) : null}
    </View>
  );
}
