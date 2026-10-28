import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import type { EsimWallet } from '@/contracts/mobile/shop/v1/esim';
import { useSetCartLine } from '@/features/cart/use-cart';
import { useErrorMessage } from '@/i18n/use-error-message';

/** What the shopper typed, in cents; `null` when it is not an amount. */
export function centsOf(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole = '0', fraction = ''] = normalized.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/**
 * The balance and adding to it (APP-07): an amount goes in the cart, which
 * adds the fee and says the total. The balance pays for eSIMs and top-ups at
 * checkout.
 */
export function WalletView({ wallet }: { wallet: EsimWallet }) {
  const t = useTranslations('esim');
  const router = useRouter();
  const toast = useToast();
  const describe = useErrorMessage();
  const tabBar = useTabBarHeight();
  const setLine = useSetCartLine();
  const [text, setText] = useState(wallet.presets[1]?.amount.toFixed(2) ?? '');
  const cents = centsOf(text);
  const minCents = Math.round(wallet.min.amount * 100);
  const maxCents = Math.round(wallet.max.amount * 100);
  const valid = cents !== null && cents >= minCents && cents <= maxCents;

  const add = () => {
    if (!valid || !wallet.product) return;
    setLine.mutate(
      { ...wallet.product, quantity: 1, lineAttributes: { wallet: cents } },
      {
        onSuccess: () => router.push('/cart'),
        onError: (error: unknown) => toast.show({ message: describe(error) }),
      }
    );
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 px-4 pt-3"
      contentContainerStyle={{ paddingBottom: tabBar + 16 }}
      keyboardShouldPersistTaps="handled">
      <View className="gap-1 rounded-xl bg-surface p-4">
        <Text variant="caption">{t('balance')}</Text>
        <Text variant="price-large">{wallet.balance.formatted}</Text>
      </View>
      {wallet.enabled ? (
        <View className="gap-3 rounded-xl bg-surface p-4">
          <Text variant="subheading">{t('addMoney')}</Text>
          <View className="flex-row flex-wrap gap-2">
            {wallet.presets.map((preset) => (
              <Chip
                key={preset.formatted}
                label={preset.formatted}
                selected={centsOf(text) === Math.round(preset.amount * 100)}
                onPress={() => setText(preset.amount.toFixed(2))}
              />
            ))}
          </View>
          <TextField
            label={t('amount')}
            value={text}
            onChangeText={setText}
            keyboardType="decimal-pad"
            on="surface"
            hint={t('amountRange', { min: wallet.min.formatted, max: wallet.max.formatted })}
            error={
              text && !valid
                ? t('amountRange', { min: wallet.min.formatted, max: wallet.max.formatted })
                : undefined
            }
          />
          {wallet.fee.fixed.amount > 0 || wallet.fee.percent > 0 ? (
            <Text variant="caption">
              {t('walletFee', { fixed: wallet.fee.fixed.formatted, percent: wallet.fee.percent })}
            </Text>
          ) : null}
          <Button
            label={t('addToCart')}
            disabled={!valid}
            loading={setLine.isPending}
            onPress={add}
          />
        </View>
      ) : (
        <Text className="text-muted">{t('walletOff')}</Text>
      )}
      <Text variant="caption">{t('walletNote')}</Text>
    </ScrollView>
  );
}
