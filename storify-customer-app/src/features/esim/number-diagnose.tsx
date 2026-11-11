import { useState } from 'react';
import { View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import type { EsimNumberDetail } from '@/contracts/mobile/shop/v1/esim';
import { isApiError } from '@/api/errors';

import { useNumberError } from './number-money';
import { Asking } from './number-services-tab';
import { Panel, Section } from './number-ui';
import {
  useEsimNumberAction,
  useEsimNumberDiagnostics,
  useReconnectEsimNumber,
} from './use-numbers';

/** The network's names for kinds of activity the app has words for. */
const ACTIVITY = [
  'outbound_call',
  'inbound_call',
  'data',
  'sms_outbound',
  'sms_inbound',
  'sms_inbound_nonclassic',
  'voicemail',
] as const;
type Activity = (typeof ACTIVITY)[number];
const isKnown = (type: string): type is Activity => (ACTIVITY as readonly string[]).includes(type);

/**
 * Diagnosing a number (the website's Diagnose tab): a check list for a line
 * that does not connect, what the network last saw of it, a test text to
 * itself, and a reconnect that restarts the SIM.
 */
export function NumberDiagnoseTab({ number }: { number: EsimNumberDetail }) {
  const t = useTranslations('esim.diagnose');
  const ts = useTranslations('esim.services');
  const format = useFormatter();
  const toast = useToast();
  const describe = useNumberError();
  const result = useEsimNumberDiagnostics(number.id);
  const reconnect = useReconnectEsimNumber(number.id);
  const [connects, setConnects] = useState<'yes' | 'no' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sms, setSms] = useState(false);
  const when = (at: string | undefined) =>
    at ? format.dateTime(new Date(at), { dateStyle: 'medium', timeStyle: 'medium' }) : '—';
  const data = result.data;
  // The store names it only within ten minutes of the last reconnect.
  const waitUntil = data?.reconnectAfter ?? null;
  const steps =
    connects === 'no'
      ? [t('noStep1'), t('noStep2'), t('noStep3'), t('noStep4')]
      : connects === 'yes'
        ? [t('yesStep1'), t('yesStep2'), t('yesStep3')]
        : [];

  return (
    <Panel
      title={t('title')}
      action={
        <Button
          label={ts('refresh')}
          size="sm"
          variant="ghost"
          loading={result.isFetching}
          onPress={() => void result.refetch()}
        />
      }>
      <Section title={t('question')}>
        <Text variant="caption">{t('questionHint')}</Text>
        <View className="flex-row gap-2">
          <Chip
            kind="option"
            label={t('yes')}
            selected={connects === 'yes'}
            onPress={() => setConnects('yes')}
          />
          <Chip
            kind="option"
            label={t('no')}
            selected={connects === 'no'}
            onPress={() => setConnects('no')}
          />
        </View>
        {steps.map((step, index) => (
          <Text key={step} className="text-muted">
            {index + 1}. {step}
          </Text>
        ))}
      </Section>

      {result.isPending ? (
        <Asking />
      ) : result.isError || !data ? (
        <Text className="text-muted">{ts('unavailable')}</Text>
      ) : (
        <>
          <Section title={t('session')}>
            <Text className="text-muted">
              {!data.sessionKnown
                ? '—'
                : data.session
                  ? t('sessionOpen', {
                      time: when(data.session.startedAt),
                      network: data.session.network ?? '—',
                    })
                  : t('sessionNone')}
            </Text>
          </Section>
          <Section title={t('location')}>
            <Text className="text-muted">
              {!data.locationKnown
                ? '—'
                : data.location
                  ? `${when(data.location.at)} · ${data.location.network}`
                  : t('never')}
            </Text>
          </Section>
          <Section title={t('activity')}>
            {data.activity === null ? (
              <Text className="text-muted">{t('activityUnavailable')}</Text>
            ) : data.activity.length === 0 ? (
              <Text className="text-muted">{t('never')}</Text>
            ) : (
              data.activity.map((entry) => (
                <View
                  key={entry.type}
                  className="flex-row justify-between gap-3 border-b border-border py-2">
                  <View className="flex-1 gap-0.5">
                    <Text>
                      {isKnown(entry.type)
                        ? t(`kind.${entry.type}`)
                        : entry.type.replace(/_/g, ' ')}
                    </Text>
                    {entry.detail ? <Text variant="caption">{entry.detail}</Text> : null}
                  </View>
                  <View className="items-end">
                    <Text variant="caption">{when(entry.at)}</Text>
                    {entry.cost ? <Text variant="caption">{entry.cost.formatted}</Text> : null}
                  </View>
                </View>
              ))
            )}
          </Section>
        </>
      )}

      <View className="flex-row flex-wrap gap-2">
        {number.blocked !== true ? (
          <Button label={t('smsToSelf')} size="sm" variant="outline" onPress={() => setSms(true)} />
        ) : null}
        {data?.reconnectSupported !== false ? (
          <Button
            label={t('reconnect')}
            size="sm"
            variant="outline"
            disabled={Boolean(waitUntil)}
            onPress={() => setConfirming(true)}
          />
        ) : null}
      </View>
      {data?.reconnectSupported === false ? (
        <Text variant="caption">{t('reconnectUnsupported')}</Text>
      ) : null}
      {waitUntil ? (
        <Text variant="caption">{t('reconnectWait', { time: when(waitUntil) })}</Text>
      ) : null}
      <Text variant="caption">{t('note')}</Text>

      <Sheet
        visible={confirming}
        title={t('reconnect')}
        onClose={() => setConfirming(false)}
        footer={
          <View className="gap-3">
            <Button
              label={t('reconnectConfirm')}
              loading={reconnect.isPending}
              onPress={() =>
                reconnect.mutate(undefined, {
                  onSuccess: () => {
                    setConfirming(false);
                    toast.show({ message: t('reconnected') });
                  },
                  onError: (error: unknown) => {
                    setConfirming(false);
                    toast.show({
                      message:
                        isApiError(error) && error.reason === 'RECONNECT_UNSUPPORTED'
                          ? t('reconnectUnsupported')
                          : describe(error),
                    });
                  },
                })
              }
            />
            <Button label={t('cancel')} variant="secondary" onPress={() => setConfirming(false)} />
          </View>
        }>
        <Text className="text-muted">{t('reconnectHint')}</Text>
      </Sheet>
      <SmsSheet number={number} open={sms} onClose={() => setSms(false)} />
    </Panel>
  );
}

/** "Send SMS to myself": a text to the number, to check that it receives. */
function SmsSheet({
  number,
  open,
  onClose,
}: {
  number: EsimNumberDetail;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('esim.diagnose');
  const toast = useToast();
  const describe = useNumberError();
  const action = useEsimNumberAction(number.id);
  const [from, setFrom] = useState(number.smsSender);
  const [message, setMessage] = useState('');
  const length = [...message.trim()].length;
  const max = number.smsMaxChars;

  return (
    <Sheet
      visible={open}
      title={t('smsToSelf')}
      onClose={onClose}
      footer={
        <Button
          label={t('smsSend')}
          loading={action.isPending}
          disabled={!length || length > max || !/^\+?\d{3,15}$/.test(from)}
          onPress={() =>
            action.mutate(
              { action: 'sms', body: { from, message } },
              {
                onSuccess: () => {
                  toast.show({ message: t('smsSent', { number: number.display }) });
                  setMessage('');
                  onClose();
                },
                onError: (error: unknown) => toast.show({ message: describe(error) }),
              }
            )
          }
        />
      }>
      <View className="gap-4">
        <Text variant="caption">{t('smsHint', { number: number.display })}</Text>
        <TextField
          label={t('smsFrom')}
          keyboardType="phone-pad"
          value={from}
          onChangeText={(text) => setFrom(text.replace(/[^\d+]/g, '').slice(0, 16))}
        />
        <TextField
          label={t('smsMessage')}
          multiline
          numberOfLines={4}
          maxLength={max}
          value={message}
          onChangeText={setMessage}
          hint={`${length} / ${max}`}
        />
      </View>
    </Sheet>
  );
}
