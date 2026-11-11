import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import type { EsimNumberCardPackage, EsimNumberDetail } from '@/contracts/mobile/shop/v1/esim';

import { actionKey, parseCardAmount, rechargeValid, useNumberError } from './number-money';
import { chosenRecharge, PacketPicker, RechargePicker } from './number-pickers';
import { Line, Panel } from './number-ui';
import {
  useBuyEsimNumberTopup,
  useCancelEsimNumberPacket,
  useEsimNumberPrice,
  useEsimNumberAction,
  useRefreshEsimNumber,
} from './use-numbers';

/**
 * A number's balance and data (NUM-06/08/09): its credit and packages, read
 * again on request; credit and data packages bought as cart lines and put on
 * the number after the payment; a package listed with its code cancelled;
 * credit moved to another of the platform's numbers.
 */
export function NumberBalanceTab({ number }: { number: EsimNumberDetail }) {
  const t = useTranslations('esim.number');
  const format = useFormatter();
  const toast = useToast();
  const describe = useNumberError();
  const refresh = useRefreshEsimNumber(number.id);
  const [sheet, setSheet] = useState<'recharge' | 'packet' | 'transfer' | null>(null);
  const when = (value: string | undefined | null) =>
    value ? format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short' }) : null;
  const blocked = number.blocked === true;
  const { topups } = number;
  const packets = topups.packetGroups.some((group) => group.packets.length > 0);

  return (
    <>
      <Panel
        title={t('card')}
        action={
          <Button
            label={t('refresh')}
            size="sm"
            variant="outline"
            loading={refresh.isPending}
            onPress={() =>
              refresh.mutate(undefined, {
                onError: (error: unknown) => toast.show({ message: describe(error) }),
              })
            }
          />
        }>
        {number.checkedAt ? (
          <>
            <Text variant="price-large">
              {number.balance?.formatted ?? '—'} <Text variant="caption">{t('balance')}</Text>
            </Text>
            {number.packages.length ? (
              <View className="gap-2">
                {number.packages.map((entry, index) => (
                  <PackageRow
                    key={`${entry.packetId ?? 'p'}-${index}`}
                    number={number}
                    entry={entry}
                  />
                ))}
              </View>
            ) : (
              <Text className="text-muted">{t('noPackets')}</Text>
            )}
          </>
        ) : (
          <Text className="text-muted">{t('noCard')}</Text>
        )}
        {!blocked ? (
          <View className="flex-row flex-wrap gap-2">
            {topups.buyable ? (
              <Button
                label={t('addCredit')}
                size="sm"
                icon="plus"
                onPress={() => setSheet('recharge')}
              />
            ) : null}
            <Button
              label={t('transfer')}
              size="sm"
              variant="outline"
              onPress={() => setSheet('transfer')}
            />
            {topups.buyable && packets ? (
              <Button
                label={t('buyPacket')}
                size="sm"
                variant="outline"
                onPress={() => setSheet('packet')}
              />
            ) : null}
          </View>
        ) : null}
        {number.stale && number.checkedAt ? (
          <Text variant="caption">{t('stale', { time: when(number.checkedAt) ?? '' })}</Text>
        ) : null}
      </Panel>

      <Panel title={t('details')}>
        <View className="gap-2">
          {number.orderNumber ? <Line label={t('order')} value={number.orderNumber} /> : null}
          <Line label="ICCID" value={number.iccid} />
          {number.checkedAt ? (
            <Line label={t('updatedAt')} value={when(number.checkedAt) ?? ''} />
          ) : null}
        </View>
        <Text variant="caption">{t('validHint')}</Text>
      </Panel>

      <TopupSheet
        number={number}
        kind={sheet === 'recharge' || sheet === 'packet' ? sheet : null}
        onClose={() => setSheet(null)}
      />
      <TransferSheet number={number} open={sheet === 'transfer'} onClose={() => setSheet(null)} />
    </>
  );
}

function PackageRow({ number, entry }: { number: EsimNumberDetail; entry: EsimNumberCardPackage }) {
  const t = useTranslations('esim.number');
  const format = useFormatter();
  const toast = useToast();
  const describe = useNumberError();
  const cancel = useCancelEsimNumberPacket(number.id);
  const [asking, setAsking] = useState(false);

  return (
    <View className="gap-1.5 rounded-lg border border-border p-3">
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="label" className="flex-1">
          {entry.name}
        </Text>
        {entry.ordered ? (
          <Text variant="caption">{t('packetOrdered')}</Text>
        ) : entry.packetId ? (
          <Button
            label={t('cancelPacket')}
            size="sm"
            variant="ghost"
            onPress={() => setAsking(true)}
          />
        ) : null}
      </View>
      {entry.leftPercent !== undefined ? (
        <>
          <View className="h-2 overflow-hidden rounded-full bg-surface-alt">
            <View
              className="h-2 rounded-full bg-accent"
              style={{ width: `${entry.leftPercent}%` }}
            />
          </View>
          <View className="flex-row justify-between">
            <Text variant="caption">{t('left', { amount: entry.left ?? '—' })}</Text>
            <Text variant="caption">{t('ofTotal', { amount: entry.total ?? '—' })}</Text>
          </View>
        </>
      ) : null}
      {entry.expiresAt ? (
        <Text variant="caption">
          {t('packetUntil', {
            date: format.dateTime(new Date(entry.expiresAt), {
              dateStyle: 'medium',
              timeStyle: 'short',
            }),
          })}
        </Text>
      ) : null}
      <Sheet
        visible={asking}
        title={t('cancelPacketTitle', { name: entry.name })}
        onClose={() => setAsking(false)}
        footer={
          <View className="gap-3">
            <Button
              label={t('cancelPacketConfirm')}
              variant="danger"
              loading={cancel.isPending}
              onPress={() =>
                entry.packetId &&
                cancel.mutate(entry.packetId, {
                  onSuccess: () => {
                    setAsking(false);
                    toast.show({ message: t('packetCancelled') });
                  },
                  onError: (error: unknown) => {
                    setAsking(false);
                    toast.show({ message: describe(error) });
                  },
                })
              }
            />
            <Button label={t('keep')} variant="secondary" onPress={() => setAsking(false)} />
          </View>
        }>
        <Text className="text-muted">{t('cancelPacketHint')}</Text>
      </Sheet>
    </View>
  );
}

/** Add credit or buy a data package: a cart line, paid at checkout, added to the number after. */
function TopupSheet({
  number,
  kind,
  onClose,
}: {
  number: EsimNumberDetail;
  kind: 'recharge' | 'packet' | null;
  onClose: () => void;
}) {
  const t = useTranslations('esim.number');
  const tn = useTranslations('esim.numbers');
  const router = useRouter();
  const toast = useToast();
  const describe = useNumberError();
  const buy = useBuyEsimNumberTopup(number.id);
  const { recharge, packetGroups } = number.topups;
  const [preset, setPreset] = useState(recharge.presetMinor);
  const [custom, setCustom] = useState('');
  const [packet, setPacket] = useState<string | null>(packetGroups[0]?.packets[0]?.id ?? null);
  const amount = chosenRecharge(preset, custom);
  const chosenPacket = packetGroups
    .flatMap((group) => group.packets)
    .find((entry) => entry.id === packet);
  const valid =
    kind === 'packet'
      ? Boolean(chosenPacket)
      : rechargeValid(amount, recharge.minMinor, recharge.maxMinor);
  // What it comes to and what checkout charges, priced by the store as the shopper picks.
  const price = useEsimNumberPrice(
    kind === 'packet' && packet ? { packet } : { recharge: valid ? amount : 0 },
    kind !== null && valid
  );

  const close = () => {
    setCustom('');
    onClose();
  };
  const pay = () =>
    buy.mutate(kind === 'packet' && packet ? { packet } : { recharge: amount }, {
      onSuccess: () => {
        close();
        router.push('/cart');
      },
      onError: (error: unknown) => toast.show({ message: describe(error) }),
    });

  return (
    <Sheet
      visible={kind !== null}
      title={kind === 'packet' ? t('buyPacket') : t('addCredit')}
      size={kind === 'packet' ? 'tall' : 'fit'}
      onClose={close}
      footer={
        <Button
          label={
            valid && price.data ? t('payFor', { price: price.data.total.formatted }) : t('pay')
          }
          loading={buy.isPending}
          disabled={!valid}
          onPress={pay}
        />
      }>
      <View className="gap-4">
        <Text variant="caption">{t('topupHint', { number: number.display })}</Text>
        {kind === 'packet' ? (
          <PacketPicker groups={packetGroups} value={packet} onChange={setPacket} />
        ) : (
          <RechargePicker
            recharge={recharge}
            preset={preset}
            custom={custom}
            onPreset={setPreset}
            onCustom={setCustom}
          />
        )}
        {valid &&
        price.data?.charged &&
        price.data.charged.currency !== price.data.total.currency ? (
          <Text variant="caption">
            {tn('chargedAtRate', {
              amount: price.data.total.formatted,
              price: price.data.charged.formatted,
            })}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

/** Credit from this number to another of the platform's numbers; one key per sheet opened. */
function TransferSheet({
  number,
  open,
  onClose,
}: {
  number: EsimNumberDetail;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('esim.number');
  const toast = useToast();
  const describe = useNumberError();
  const action = useEsimNumberAction(number.id);
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [key, setKey] = useState(actionKey);
  const amountMinor = parseCardAmount(amount);
  const tooMuch =
    amountMinor !== null && number.balanceMinor !== null && amountMinor > number.balanceMinor;
  const digits = to.replace(/\D/g, '');

  const close = () => {
    setAmount('');
    setKey(actionKey());
    onClose();
  };
  const send = () => {
    if (!amountMinor) return;
    action.mutate(
      { action: 'transfer', body: { to, amountMinor, key } },
      {
        onSuccess: (result) => {
          toast.show({
            message: result.state === 'completed' ? t('transferDone') : t('transferPending'),
          });
          close();
        },
        onError: (error: unknown) => {
          toast.show({ message: describe(error) });
          // A refused transfer is settled: the next try is a new one.
          setKey(actionKey());
        },
      }
    );
  };

  return (
    <Sheet
      visible={open}
      title={t('transfer')}
      onClose={close}
      footer={
        <Button
          label={
            amountMinor
              ? t('transferSend', { amount: `${amount} ${number.currency}` })
              : t('transfer')
          }
          loading={action.isPending}
          disabled={!/^\d{6,15}$/.test(digits) || !amountMinor || tooMuch}
          onPress={send}
        />
      }>
      <View className="gap-4">
        <Text variant="caption">{t('transferHint', { number: number.display })}</Text>
        <TextField
          label={t('transferTo')}
          keyboardType="phone-pad"
          placeholder="+372 5555 1234"
          value={to}
          onChangeText={(text) => setTo(text.replace(/[^\d+\s]/g, '').slice(0, 20))}
          hint={t('transferToHint')}
        />
        {number.transferTargets.length ? (
          <View className="flex-row flex-wrap gap-2">
            {number.transferTargets.map((entry) => (
              <Chip
                key={entry.msisdn}
                kind="option"
                label={entry.title}
                selected={digits === entry.msisdn}
                onPress={() => setTo(`+${entry.msisdn}`)}
              />
            ))}
          </View>
        ) : null}
        <TextField
          label={t('transferAmount', { currency: number.currency.toUpperCase() })}
          keyboardType="decimal-pad"
          placeholder="0.00"
          value={amount}
          onChangeText={(text) => setAmount(text.replace(/[^\d.,]/g, '').slice(0, 8))}
          error={
            tooMuch
              ? t('transferAvailable', { amount: number.balance?.formatted ?? '' })
              : undefined
          }
          hint={
            number.balance
              ? t('transferAvailable', { amount: number.balance.formatted })
              : undefined
          }
        />
      </View>
    </Sheet>
  );
}
