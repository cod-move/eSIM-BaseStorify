import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { CheckRow, RowGroup } from '@/components/ui/rows';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import type { EsimNumberDetail } from '@/contracts/mobile/shop/v1/esim';

import { actionKey, useNumberError } from './number-money';
import { pastMonths } from './number-statement';
import { Panel, Section } from './number-ui';
import { useEsimNumberAction, useEsimNumberStatement, useSetEsimNumberRemark } from './use-numbers';

type Dialog = 'qr' | 'owner' | 'release';

/** A new-QR-code request still being worked on. */
const OPEN_QR = new Set(['queued', 'charging', 'pending', 'refunding', 'manual']);
const QR_STATES = [
  'queued',
  'charging',
  'pending',
  'refunding',
  'manual',
  'completed',
  'rejected',
  'failed',
] as const;
type QrState = (typeof QR_STATES)[number];
const isQrState = (state: string): state is QrState =>
  (QR_STATES as readonly string[]).includes(state);

/**
 * Managing a number (the website's Manage tab): its name, a new QR code (the
 * fee off its credit, made by a person within about an hour), a recharge
 * voucher, the phone bill, moving it to another account and giving it up.
 * The last two are permanent and asked twice.
 */
export function NumberManageTab({ number }: { number: EsimNumberDetail }) {
  const t = useTranslations('esim.manage');
  const router = useRouter();
  const toast = useToast();
  const describe = useNumberError();
  const action = useEsimNumberAction(number.id);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [key, setKey] = useState(actionKey);
  const [email, setEmail] = useState('');
  const [confirm, setConfirm] = useState('');
  const [understood, setUnderstood] = useState(false);
  const blocked = number.blocked === true;
  const latest = number.qr.latest;
  const qrOpen = latest ? OPEN_QR.has(latest.state) : false;

  const open = (next: Dialog) => {
    setKey(actionKey());
    setEmail('');
    setConfirm('');
    setUnderstood(false);
    setDialog(next);
  };
  const submit = () => {
    if (!dialog) return;
    const body =
      dialog === 'qr'
        ? { key }
        : dialog === 'owner'
          ? { email: email.trim(), key }
          : { confirm, key };
    action.mutate(
      { action: dialog, body },
      {
        onSuccess: () => {
          setDialog(null);
          if (dialog === 'qr') {
            toast.show({ message: t('qrRequested') });
            return;
          }
          toast.show({ message: dialog === 'owner' ? t('ownerDone') : t('releaseDone') });
          router.replace('/account/esims');
        },
        onError: (error: unknown) => toast.show({ message: describe(error) }),
      }
    );
  };
  const ready =
    dialog === 'qr' ||
    (dialog === 'owner' && understood && /^\S+@\S+\.\S+$/.test(email.trim())) ||
    (dialog === 'release' && confirm.replace(/\D/g, '') === number.msisdn);

  return (
    <Panel title={t('title')}>
      <RemarkSection number={number} />
      {number.qr.enabled ? (
        <Section
          title={t('qr')}
          aside={
            <Text variant="caption">
              {number.qr.fee.amount > 0 ? number.qr.fee.formatted : t('free')}
            </Text>
          }>
          <Text variant="caption">{t('qrHint')}</Text>
          {latest ? (
            <Text variant="caption" className={qrOpen ? 'text-link' : undefined}>
              {isQrState(latest.state) ? t(`qrState.${latest.state}`) : latest.state}
              {latest.note ? ` — ${latest.note}` : ''}
            </Text>
          ) : null}
          <Button
            label={t('qrRequest')}
            size="sm"
            variant="outline"
            disabled={blocked || qrOpen}
            onPress={() => open('qr')}
          />
        </Section>
      ) : null}
      <VoucherSection number={number} />
      <BillSection number={number} />
      <Section title={t('owner')}>
        <Text variant="caption">{t('ownerHint')}</Text>
        <Button label={t('owner')} size="sm" variant="outline" onPress={() => open('owner')} />
      </Section>
      <Section title={t('release')} danger>
        <Text variant="caption">{t('releaseHint')}</Text>
        <Button label={t('release')} size="sm" variant="danger" onPress={() => open('release')} />
      </Section>

      <Sheet
        visible={dialog !== null}
        title={dialog === 'qr' ? t('qrRequest') : dialog === 'owner' ? t('owner') : t('release')}
        onClose={() => setDialog(null)}
        footer={
          <View className="gap-3">
            <Button
              label={
                dialog === 'qr'
                  ? t('qrRequest')
                  : dialog === 'owner'
                    ? t('ownerSubmit')
                    : t('releaseSubmit')
              }
              variant={dialog === 'release' ? 'danger' : 'primary'}
              loading={action.isPending}
              disabled={!ready}
              onPress={submit}
            />
            <Button label={t('cancel')} variant="secondary" onPress={() => setDialog(null)} />
          </View>
        }>
        <View className="gap-3">
          <Text variant="label">{number.display}</Text>
          {dialog === 'qr' ? (
            <>
              <Text className="text-warning">{t('qrWarning')}</Text>
              {number.qr.fee.amount > 0 ? (
                <Text className="text-muted">{t('qrFee', { fee: number.qr.fee.formatted })}</Text>
              ) : null}
            </>
          ) : dialog === 'owner' ? (
            <>
              <TextField
                label={t('ownerEmail')}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="off"
                value={email}
                onChangeText={setEmail}
              />
              <RowGroup>
                <CheckRow
                  title={t('ownerUnderstood')}
                  checked={understood}
                  onCheckedChange={setUnderstood}
                />
              </RowGroup>
            </>
          ) : dialog === 'release' ? (
            <TextField
              label={t('releaseConfirm', { number: `+${number.msisdn}` })}
              keyboardType="phone-pad"
              autoComplete="off"
              value={confirm}
              onChangeText={setConfirm}
            />
          ) : null}
        </View>
      </Sheet>
    </Panel>
  );
}

/** The shopper's own name for the number, e.g. "Work line". */
function RemarkSection({ number }: { number: EsimNumberDetail }) {
  const t = useTranslations('esim.manage');
  const toast = useToast();
  const describe = useNumberError();
  const save = useSetEsimNumberRemark(number.id);
  const [remark, setRemark] = useState(number.remark ?? '');

  return (
    <Section title={t('remark')}>
      <TextField label={t('remarkLabel')} maxLength={100} value={remark} onChangeText={setRemark} />
      <Button
        label={t('remarkSave')}
        size="sm"
        variant="outline"
        loading={save.isPending}
        disabled={remark.trim() === (number.remark ?? '')}
        onPress={() =>
          save.mutate(remark, {
            onSuccess: () => toast.show({ message: t('remarkSaved') }),
            onError: (error: unknown) => toast.show({ message: describe(error) }),
          })
        }
      />
    </Section>
  );
}

/** A recharge voucher's PIN, its value added to the number's credit. */
function VoucherSection({ number }: { number: EsimNumberDetail }) {
  const t = useTranslations('esim.manage');
  const toast = useToast();
  const describe = useNumberError();
  const action = useEsimNumberAction(number.id);
  const [pin, setPin] = useState('');
  const digits = pin.replace(/[\s-]/g, '');

  return (
    <Section title={t('voucher')}>
      <Text variant="caption">{t('voucherHint')}</Text>
      <TextField
        label={t('voucherCode')}
        keyboardType="number-pad"
        autoComplete="off"
        placeholder="1234 5678 9012 3456"
        value={pin}
        onChangeText={setPin}
        editable={number.blocked !== true}
      />
      <Button
        label={t('voucherRedeem')}
        size="sm"
        loading={action.isPending}
        disabled={number.blocked === true || !/^\d{6,32}$/.test(digits)}
        onPress={() =>
          action.mutate(
            { action: 'voucher', body: { pin: digits } },
            {
              onSuccess: () => {
                setPin('');
                toast.show({ message: t('voucherDone') });
              },
              onError: (error: unknown) => toast.show({ message: describe(error) }),
            }
          )
        }
      />
    </Section>
  );
}

/** The phone bill (a PDF) for whole past months, handed to the phone's viewer. */
function BillSection({ number }: { number: EsimNumberDetail }) {
  const t = useTranslations('esim.manage');
  const format = useFormatter();
  const toast = useToast();
  const describe = useNumberError();
  const statement = useEsimNumberStatement(number.id);
  const months = pastMonths();
  const last = months[0] ?? '';
  const [from, setFrom] = useState(last);
  const [to, setTo] = useState(last);
  const label = (month: string) =>
    format.dateTime(new Date(`${month}-01T00:00:00Z`), {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  const ordered = [...months].reverse();

  return (
    <Section title={t('bill')}>
      <Text variant="caption">{t('billHint')}</Text>
      <Text variant="caption">{t('billFrom')}</Text>
      <MonthChips months={ordered} value={from} label={label} onChange={setFrom} />
      <Text variant="caption">{t('billTo')}</Text>
      <MonthChips months={ordered} value={to} label={label} onChange={setTo} />
      <Button
        label={t('billDownload')}
        size="sm"
        loading={statement.isPending}
        disabled={to < from}
        onPress={() =>
          statement.mutate(
            { from, to },
            { onError: (error: unknown) => toast.show({ message: describe(error) }) }
          )
        }
      />
    </Section>
  );
}

function MonthChips({
  months,
  value,
  label,
  onChange,
}: {
  months: string[];
  value: string;
  label: (month: string) => string;
  onChange: (month: string) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {months.map((month) => (
        <Chip
          key={month}
          kind="option"
          label={label(month)}
          selected={month === value}
          onPress={() => onChange(month)}
        />
      ))}
    </View>
  );
}
