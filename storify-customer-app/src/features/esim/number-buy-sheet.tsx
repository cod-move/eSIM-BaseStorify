import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { CheckRow, RowGroup } from '@/components/ui/rows';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import type { EsimNumberOnSale, EsimNumberShop } from '@/contracts/mobile/shop/v1/esim';
import { useSession } from '@/features/auth/use-session';

import { rechargeValid, useNumberError } from './number-money';
import { chosenRecharge, PacketPicker, RechargePicker } from './number-pickers';
import { Line } from './number-ui';
import { useBuyEsimNumber, useEsimNumberPrice } from './use-numbers';

/**
 * Buying one number (NUM-03/04), as the website's dialog: the service and
 * account risks are read and accepted first; then the first credit (always
 * bought with a number) and a data package, the total in the card's currency
 * and what checkout charges for it. A guest is asked to sign in: numbers are
 * sold to accounts only. The cart prices the line again, and checkout holds
 * the number while the shopper pays.
 */
export function NumberBuySheet({
  shop,
  number,
  onClose,
}: {
  shop: EsimNumberShop;
  number: EsimNumberOnSale | null;
  onClose: () => void;
}) {
  const t = useTranslations('esim.numbers');
  const router = useRouter();
  const toast = useToast();
  const describe = useNumberError();
  const { user } = useSession();
  const buy = useBuyEsimNumber();
  const [accepted, setAccepted] = useState(false);
  const [ticked, setTicked] = useState(false);
  const [preset, setPreset] = useState(shop.recharge.presetMinor);
  const [custom, setCustom] = useState('');
  const [packet, setPacket] = useState<string | null>(null);

  const close = () => {
    setAccepted(false);
    setTicked(false);
    setCustom('');
    setPreset(shop.recharge.presetMinor);
    setPacket(null);
    onClose();
  };

  const { currency } = shop.recharge;
  const recharge = chosenRecharge(preset, custom);
  const valid = rechargeValid(recharge, shop.recharge.minMinor, shop.recharge.maxMinor);
  const chosenPacket =
    shop.packetGroups.flatMap((group) => group.packets).find((entry) => entry.id === packet) ??
    null;
  const credit = valid ? recharge : 0;
  const creditLabel = custom
    ? `${custom} ${currency}`
    : shop.recharge.suggestions.find((entry) => entry.minor === preset)?.money.formatted;
  // The total and what checkout charges, priced by the store as the shopper picks.
  const price = useEsimNumberPrice(
    { id: number?.id, recharge: credit, ...(packet ? { packet } : {}) },
    number !== null && accepted
  );

  const submit = () => {
    if (!number) return;
    if (!user) {
      close();
      router.push('/login');
      return;
    }
    buy.mutate(
      { id: number.id, recharge, ...(packet ? { packet } : {}) },
      {
        onSuccess: () => {
          close();
          router.push('/cart');
        },
        onError: (error: unknown) => toast.show({ message: describe(error) }),
      }
    );
  };

  const footer = !accepted ? (
    <View className="gap-3">
      <Button label={t('riskContinue')} disabled={!ticked} onPress={() => setAccepted(true)} />
      <Button label={t('cancel')} variant="secondary" onPress={close} />
    </View>
  ) : (
    <View className="gap-2">
      {!shop.buyable ? (
        <Text variant="caption" className="text-center text-danger">
          {t('notReady')}
        </Text>
      ) : null}
      <Button
        label={user ? t('buy') : t('signInToBuy')}
        loading={buy.isPending}
        disabled={Boolean(user) && (!shop.buyable || !valid)}
        onPress={submit}
      />
    </View>
  );

  return (
    <Sheet
      visible={number !== null}
      title={number?.display ?? ''}
      size="tall"
      onClose={close}
      footer={footer}>
      {number && !accepted ? (
        <View className="gap-3">
          <Text variant="subheading">{t('riskTitle')}</Text>
          {shop.risks.map((risk) => (
            <View key={risk} className="flex-row gap-2">
              <Text className="text-muted">•</Text>
              <Text className="flex-1 text-muted">{risk}</Text>
            </View>
          ))}
          <RowGroup>
            <CheckRow title={t('riskAgree')} checked={ticked} onCheckedChange={setTicked} />
          </RowGroup>
        </View>
      ) : number ? (
        <View className="gap-5">
          <Text variant="caption">{t('holdHint', { minutes: shop.holdMinutes })}</Text>
          <View className="gap-2">
            <Text variant="subheading">{t('rechargeTitle')}</Text>
            <RechargePicker
              recharge={shop.recharge}
              preset={preset}
              custom={custom}
              onPreset={setPreset}
              onCustom={setCustom}
            />
          </View>
          {shop.packetGroups.length ? (
            <View className="gap-2">
              <Text variant="subheading">{t('packetTitle')}</Text>
              <PacketPicker
                groups={shop.packetGroups}
                value={packet}
                onChange={setPacket}
                allowNone
              />
            </View>
          ) : null}
          <View className="gap-1.5 rounded-xl bg-surface p-4">
            <Line label={t('numberPrice')} value={number.numberPrice.formatted} />
            {number.premium ? (
              <Line label={t('premiumFee')} value={number.premium.formatted} />
            ) : null}
            {credit && creditLabel ? <Line label={t('creditLine')} value={creditLabel} /> : null}
            {chosenPacket ? (
              <Line label={chosenPacket.name} value={chosenPacket.price.formatted} />
            ) : null}
            <View className="mt-1 flex-row justify-between border-t border-border pt-2">
              <Text variant="label">{t('total')}</Text>
              <Text variant="price">{price.data?.total.formatted ?? '—'}</Text>
            </View>
            {price.data?.charged && price.data.charged.currency !== price.data.total.currency ? (
              <Text variant="caption">
                {t('chargedAtRate', {
                  amount: price.data.total.formatted,
                  price: price.data.charged.formatted,
                })}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}
