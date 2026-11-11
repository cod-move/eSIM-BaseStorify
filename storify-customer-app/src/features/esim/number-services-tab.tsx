import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { RowGroup, SwitchRow } from '@/components/ui/rows';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import type {
  EsimNumberDetail,
  EsimNumberServices,
  EsimNumberSwitch,
} from '@/contracts/mobile/shop/v1/esim';

import { parseCardAmount, useNumberError } from './number-money';
import { Panel, Section } from './number-ui';
import {
  useEsimNumberDataLimit,
  useEsimNumberServices,
  useSetEsimNumberDataLimit,
  useSetEsimNumberForward,
  useSetEsimNumberService,
} from './use-numbers';

/** Forwarding takes a number with its country code (the website's rule, lib/esim/numbers/service-policy.ts). */
const FORWARD_DIGITS = /^[1-9]\d{5,14}$/;

/**
 * A number's services (the website's Services tab), read from the network as
 * the tab opens: data, texts, calls and voicemail switched on and off, call
 * forwarding, and a daily data spending limit.
 */
export function NumberServicesTab({ number }: { number: EsimNumberDetail }) {
  const t = useTranslations('esim.services');
  const services = useEsimNumberServices(number.id);

  return (
    <Panel
      title={t('title')}
      action={
        <Button
          label={t('refresh')}
          size="sm"
          variant="ghost"
          loading={services.isFetching}
          onPress={() => void services.refetch()}
        />
      }>
      {services.isPending ? (
        <Asking />
      ) : services.isError ? (
        <Text className="text-muted">{t('unavailable')}</Text>
      ) : (
        <>
          {services.data.blocked ? <Text className="text-danger">{t('blocked')}</Text> : null}
          <Switches id={number.id} services={services.data} />
          {/* A new answer from the network starts the field again from it. */}
          <Forwarding key={services.data.forwardTo ?? ''} id={number.id} services={services.data} />
          <DataLimit id={number.id} currency={number.currency} blocked={services.data.blocked} />
        </>
      )}
    </Panel>
  );
}

export function Asking() {
  const t = useTranslations('esim.services');
  return (
    <View className="flex-row items-center gap-2">
      <ActivityIndicator />
      <Text className="text-muted">{t('loading')}</Text>
    </View>
  );
}

function Switches({ id, services }: { id: string; services: EsimNumberServices }) {
  const t = useTranslations('esim.services');
  const toast = useToast();
  const describe = useNumberError();
  const change = useSetEsimNumberService(id);
  const rows: { key: EsimNumberSwitch; title: string; hint: string }[] = [
    { key: 'data', title: t('data'), hint: t('dataHint') },
    { key: 'sms', title: t('sms'), hint: t('smsHint') },
    { key: 'voice', title: t('voice'), hint: t('voiceHint') },
    { key: 'voicemail', title: t('voicemail'), hint: t('voicemailHint') },
  ];

  return (
    <RowGroup>
      {rows.map(({ key, title, hint }) => {
        const value = services[key];
        return (
          <SwitchRow
            key={key}
            title={title}
            description={value === null ? `${hint} ${t('unknown')}` : hint}
            value={value === true}
            disabled={
              value === null ||
              services.blocked ||
              change.isPending ||
              (key === 'data' && value === true)
            }
            onValueChange={(on) =>
              change.mutate(
                { service: key, on },
                {
                  onSuccess: (result) =>
                    toast.show({ message: result.on ? t('turnedOn') : t('turnedOff') }),
                  onError: (error: unknown) => toast.show({ message: describe(error) }),
                }
              )
            }
          />
        );
      })}
    </RowGroup>
  );
}

function Forwarding({ id, services }: { id: string; services: EsimNumberServices }) {
  const t = useTranslations('esim.services');
  const toast = useToast();
  const describe = useNumberError();
  const forward = useSetEsimNumberForward(id);
  const [input, setInput] = useState(services.forwardTo ? `+${services.forwardTo}` : '');
  const digits = input.replace(/[\s()+-]/g, '');
  const valid = FORWARD_DIGITS.test(digits);
  const save = (to: string | null) =>
    forward.mutate(to, {
      onSuccess: (result) =>
        toast.show({ message: result.forwardTo ? t('forwardSet') : t('forwardOff') }),
      onError: (error: unknown) => toast.show({ message: describe(error) }),
    });

  return (
    <Section
      title={t('forward')}
      aside={
        <Text variant="caption" className={services.forwardTo ? 'text-link' : undefined}>
          {services.forwardTo ? `+${services.forwardTo}` : t('forwardInactive')}
        </Text>
      }>
      <Text variant="caption">{t('forwardHint')}</Text>
      {!services.forwardKnown ? (
        <Text variant="caption">{t('unknown')}</Text>
      ) : (
        <>
          <TextField
            label={t('forwardTo')}
            keyboardType="phone-pad"
            placeholder="+1 212 555 0123"
            value={input}
            onChangeText={setInput}
            editable={!services.blocked && !forward.isPending}
            error={digits && !valid ? t('forwardInvalid') : undefined}
          />
          <View className="flex-row gap-2">
            <Button
              label={t('forwardSave')}
              size="sm"
              loading={forward.isPending}
              disabled={!valid || services.blocked || digits === services.forwardTo}
              onPress={() => save(digits)}
            />
            {services.forwardTo ? (
              <Button
                label={t('forwardStop')}
                size="sm"
                variant="outline"
                disabled={services.blocked || forward.isPending}
                onPress={() => save(null)}
              />
            ) : null}
          </View>
        </>
      )}
    </Section>
  );
}

function DataLimit({ id, currency, blocked }: { id: string; currency: string; blocked: boolean }) {
  const t = useTranslations('esim.services');
  const format = useFormatter();
  const view = useEsimNumberDataLimit(id);
  const limit = view.data?.limit ?? null;

  return (
    <Section
      title={t('limit')}
      aside={
        <Text variant="caption" className="text-warning">
          {t('experimental')}
        </Text>
      }>
      <Text variant="caption">{t('limitHint', { currency })}</Text>
      {view.isPending ? (
        <ActivityIndicator />
      ) : !view.data?.known ? (
        <Text variant="caption">{t('unknown')}</Text>
      ) : (
        <>
          <Text>
            {limit
              ? t('limitNow', {
                  value: limit.value?.formatted ?? '—',
                  used: limit.used?.formatted ?? '—',
                  until: limit.periodEnd
                    ? format.dateTime(new Date(limit.periodEnd), {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                    : '—',
                })
              : t('limitNone')}
          </Text>
          {/* A new limit from the network starts the field again from it. */}
          <LimitForm
            key={limit?.valueMinor ?? 0}
            id={id}
            currency={currency}
            blocked={blocked}
            current={limit?.valueMinor}
            hasLimit={limit !== null}
            min={view.data.minMinor}
            max={view.data.maxMinor}
          />
        </>
      )}
    </Section>
  );
}

function LimitForm({
  id,
  currency,
  blocked,
  current,
  hasLimit,
  min,
  max,
}: {
  id: string;
  currency: string;
  blocked: boolean;
  current: number | undefined;
  hasLimit: boolean;
  min: number;
  max: number;
}) {
  const t = useTranslations('esim.services');
  const toast = useToast();
  const describe = useNumberError();
  const save = useSetEsimNumberDataLimit(id);
  const [input, setInput] = useState(current ? (current / 100).toFixed(2) : '');
  const cents = parseCardAmount(input);
  const valid = cents !== null && cents >= min && cents <= max;
  const set = (valueMinor: number | null) =>
    save.mutate(valueMinor, {
      onSuccess: (result) =>
        toast.show({ message: result.limit ? t('limitSet') : t('limitRemoved') }),
      onError: (error: unknown) => toast.show({ message: describe(error) }),
    });

  return (
    <>
      <TextField
        label={t('limitAmount', { currency })}
        keyboardType="decimal-pad"
        placeholder="1.00"
        value={input}
        onChangeText={setInput}
        editable={!blocked && !save.isPending}
        error={input && !valid ? t('limitInvalid') : undefined}
      />
      <View className="flex-row gap-2">
        <Button
          label={t('limitSave')}
          size="sm"
          loading={save.isPending}
          disabled={!valid || blocked || cents === current}
          onPress={() => cents !== null && set(cents)}
        />
        {hasLimit ? (
          <Button
            label={t('limitRemove')}
            size="sm"
            variant="outline"
            disabled={blocked || save.isPending}
            onPress={() => set(null)}
          />
        ) : null}
      </View>
    </>
  );
}
