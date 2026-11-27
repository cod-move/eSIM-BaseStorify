import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { setStringAsync } from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useTranslations } from 'use-intl';

import {
  chooseEsimCrypto,
  getEsimCrypto,
  getEsimPayChoices,
  startEsimCrypto,
} from '@/api/endpoints/esim-pay';
import { queryKeys } from '@/api/query-keys';
import { useTabBarHeight } from '@/components/shell/tab-bar';
import { AppImage } from '@/components/ui/app-image';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { NavRow, RowGroup } from '@/components/ui/rows';
import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import type {
  EsimCryptoInvoice,
  EsimCryptoOption,
  EsimCryptoPayment,
  EsimPayChoices,
} from '@/contracts/mobile/shop/v1/esim';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useLocale } from '@/i18n/locale-store';

import { endPayInApp } from './crypto-pay-session';

/** How often a crypto payment is asked about while it waits (BEpusdt's own page asks every 5 s). */
const POLL_MS = 5000;

/**
 * The eSIM payment page's methods, in the app (APP-09): a crypto method is
 * paid here — coin and network, then the address, the exact amount and a QR
 * code, asked about until the gateway sees the money — and any other is paid
 * on the page, started at once there. Leaving the screen ends the step of
 * `payByRedirect` that opened it (./crypto-pay-session.ts).
 */
export function EsimPayScreen({ checkoutRef, method }: { checkoutRef: string; method?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const [payment, setPayment] = useState<string | null>(null);
  // An address was shown: leaving now may still mean money on its way.
  const paying = useRef(false);
  const ended = useRef(false);

  const finish = (end: Parameters<typeof endPayInApp>[0]) => {
    if (ended.current) return;
    ended.current = true;
    endPayInApp(end);
  };

  // Left with Back or the header: the step ends with what is known.
  useEffect(
    () => () => {
      if (!ended.current) {
        ended.current = true;
        endPayInApp({ kind: 'done', paying: paying.current });
      }
    },
    []
  );

  const choices = useQuery({
    queryKey: queryKeys.esimPayChoices(locale, checkoutRef),
    queryFn: ({ signal }) => getEsimPayChoices(locale, checkoutRef, signal),
    staleTime: 0,
  });
  // Paid already (from another try): the outcome is the store's to tell.
  const alreadyPaid = choices.data?.state === 'paid';
  useEffect(() => {
    if (!alreadyPaid || ended.current) return;
    ended.current = true;
    endPayInApp({ kind: 'done', paying: true });
  }, [alreadyPaid]);

  if (payment) {
    return (
      <CryptoPayment
        checkoutRef={checkoutRef}
        payment={payment}
        onAddress={() => {
          paying.current = true;
        }}
        onPaid={() => finish({ kind: 'done', paying: true })}
        onBack={() => router.back()}
      />
    );
  }
  if (choices.isPending) return <LoadingState />;
  if (choices.isError) {
    return <ErrorState error={choices.error} onRetry={() => void choices.refetch()} />;
  }
  return (
    <MethodList
      checkoutRef={checkoutRef}
      choices={choices.data}
      preferred={method}
      onCrypto={setPayment}
      onPage={(method) => {
        finish({ kind: 'page', method });
        router.back();
      }}
      onSheet={(method) => {
        finish({ kind: 'sheet', method });
        router.back();
      }}
    />
  );
}

function MethodList({
  checkoutRef,
  choices,
  preferred,
  onCrypto,
  onPage,
  onSheet,
}: {
  checkoutRef: string;
  choices: EsimPayChoices;
  /** Chosen in checkout's list already. */
  preferred?: string;
  onCrypto: (payment: string) => void;
  onPage: (method: string) => void;
  onSheet: (method: string) => void;
}) {
  const t = useTranslations('esim.cryptoPay');
  const locale = useLocale();
  const toast = useToast();
  const describe = useErrorMessage();
  const queryClient = useQueryClient();
  const tabBar = useTabBarHeight();

  const start = useMutation({
    mutationFn: (method: string) => startEsimCrypto(locale, checkoutRef, method),
    onSuccess: (view) => {
      queryClient.setQueryData(queryKeys.esimCrypto(locale, checkoutRef, view.reference), view);
      onCrypto(view.reference);
    },
    onError: (error) => toast.show({ message: describe(error) }),
  });

  // Chosen in checkout's list, or the only method, paid here: no list to choose from.
  const only =
    choices.methods.find((entry) => entry.nativeKind === 'crypto' && entry.code === preferred) ??
    (choices.methods.length === 1 && choices.methods[0]?.nativeKind === 'crypto'
      ? choices.methods[0]
      : null);
  const started = useRef(false);
  useEffect(() => {
    if (!only || started.current || choices.state !== 'open') return;
    started.current = true;
    start.mutate(only.code);
  }, [only, choices.state, start]);

  if (only && !start.isError) return <LoadingState />;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 px-4 pt-3"
      contentContainerStyle={{ paddingBottom: tabBar + 16 }}>
      <View className="gap-1 rounded-xl bg-surface p-4">
        <Text variant="caption">{t('total')}</Text>
        <Text variant="price-large">{choices.total.formatted}</Text>
      </View>
      {choices.state !== 'open' ? (
        <Text className="text-muted">{t('closed')}</Text>
      ) : (
        <>
          <Text variant="heading">{t('chooseMethod')}</Text>
          <RowGroup>
            {choices.methods.map((method) => (
              <NavRow
                key={method.code}
                icon={method.nativeKind === 'sheet' ? 'card' : method.native ? 'wallet' : 'globe'}
                title={method.name}
                description={method.native ? t('inApp') : t('onPage')}
                disabled={start.isPending}
                value={
                  start.isPending && start.variables === method.code ? (
                    <ActivityIndicator />
                  ) : undefined
                }
                onPress={() =>
                  method.nativeKind === 'sheet'
                    ? onSheet(method.code)
                    : method.native
                      ? start.mutate(method.code)
                      : onPage(method.code)
                }
              />
            ))}
          </RowGroup>
        </>
      )}
    </ScrollView>
  );
}

function CryptoPayment({
  checkoutRef,
  payment,
  onAddress,
  onPaid,
  onBack,
}: {
  checkoutRef: string;
  payment: string;
  onAddress: () => void;
  onPaid: () => void;
  onBack: () => void;
}) {
  const t = useTranslations('esim.cryptoPay');
  const locale = useLocale();
  const toast = useToast();
  const describe = useErrorMessage();
  const queryClient = useQueryClient();
  const tabBar = useTabBarHeight();
  const [changing, setChanging] = useState(false);
  const key = queryKeys.esimCrypto(locale, checkoutRef, payment);

  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getEsimCrypto(locale, checkoutRef, payment, signal),
    refetchInterval: (current) =>
      current.state.data && waitingOn(current.state.data) ? POLL_MS : false,
  });
  const choose = useMutation({
    mutationFn: (option: EsimCryptoOption) =>
      chooseEsimCrypto(locale, checkoutRef, {
        payment,
        currency: option.currency,
        network: option.network,
      }),
    onSuccess: (view) => {
      queryClient.setQueryData(key, view);
      setChanging(false);
    },
    onError: (error) => toast.show({ message: describe(error) }),
  });

  const view = query.data;
  const paid = view ? view.state === 'paid' || view.invoice?.state === 'paid' : false;
  useEffect(() => {
    if (view?.invoice && view.invoice.state !== 'expired' && view.invoice.state !== 'cancelled') {
      onAddress();
    }
  }, [view?.invoice, onAddress]);
  useEffect(() => {
    if (paid) onPaid();
  }, [paid, onPaid]);

  if (query.isPending) return <LoadingState />;
  if (!view) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const invoice = view.invoice;
  const choosing = !invoice || changing;
  const over =
    view.state !== 'pending' ||
    (invoice && ['expired', 'cancelled', 'failed'].includes(invoice.state));

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 px-4 pt-3"
      contentContainerStyle={{ paddingBottom: tabBar + 16 }}>
      <View className="gap-1 rounded-xl bg-surface p-4">
        <Text variant="caption">{t('total')}</Text>
        <Text variant="price-large">{view.total.formatted}</Text>
      </View>
      {paid ? (
        <View className="items-center gap-3 rounded-xl bg-surface p-6">
          <ActivityIndicator />
          <Text variant="subheading">{t('received')}</Text>
        </View>
      ) : over ? (
        <View className="gap-3 rounded-xl bg-surface p-4">
          <Text variant="subheading">
            {t(invoice?.state === 'expired' || view.state === 'expired' ? 'expired' : 'ended')}
          </Text>
          <Text className="text-muted">{t('endedText')}</Text>
          <Button label={t('backToCheckout')} onPress={onBack} />
        </View>
      ) : choosing ? (
        <CoinList
          options={view.options}
          busy={choose.isPending ? (choose.variables ?? null) : null}
          onChoose={(option) => choose.mutate(option)}
          onCancel={invoice ? () => setChanging(false) : undefined}
        />
      ) : (
        <Invoice
          invoice={invoice}
          canChange={view.options.length > 1 && invoice.state === 'waiting'}
          onChange={() => setChanging(true)}
        />
      )}
      {query.isError && view ? (
        <Text variant="caption" className="text-center">
          {describe(query.error)}
        </Text>
      ) : null}
    </ScrollView>
  );
}

/** Still to be paid (or being confirmed): asked about again. */
function waitingOn(view: EsimCryptoPayment) {
  if (view.state !== 'pending') return false;
  return !view.invoice || view.invoice.state === 'waiting' || view.invoice.state === 'confirming';
}

/** The coins, one row each with its networks named; one with several networks asks which next. */
function CoinList({
  options,
  busy,
  onChoose,
  onCancel,
}: {
  options: EsimCryptoOption[];
  busy: EsimCryptoOption | null;
  onChoose: (option: EsimCryptoOption) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations('esim.cryptoPay');
  const coins = groupByCoin(options);
  const [coin, setCoin] = useState<string | null>(null);
  const picked = coins.find((entry) => entry.currency === coin) ?? null;
  const isBusy = (option: EsimCryptoOption) =>
    busy !== null && busy.currency === option.currency && busy.network === option.network;

  if (picked) {
    return (
      <View className="gap-3">
        <View className="flex-row items-center gap-3">
          <CoinBadge label={picked.currency} icon={picked.icon} />
          <Text variant="heading" className="flex-1">
            {t('chooseNetwork', { currency: picked.currency })}
          </Text>
        </View>
        <RowGroup>
          {picked.options.map((option) => (
            <PickRow
              key={option.network}
              label={option.networkName}
              icon={option.networkIcon}
              title={option.networkName}
              value={isBusy(option) ? <ActivityIndicator /> : `${option.amount} ${option.currency}`}
              disabled={busy !== null}
              onPress={() => onChoose(option)}
            />
          ))}
        </RowGroup>
        <Text variant="caption">{t('chooseNetworkHint')}</Text>
        <Button
          variant="ghost"
          label={t('otherCoin')}
          disabled={busy !== null}
          onPress={() => setCoin(null)}
        />
      </View>
    );
  }

  return (
    <View className="gap-3">
      <Text variant="heading">{t('chooseCurrency')}</Text>
      {coins.length ? (
        <RowGroup>
          {coins.map((entry) => {
            const single = entry.options.length === 1 ? entry.options[0] : null;
            return (
              <PickRow
                key={entry.currency}
                label={entry.currency}
                icon={entry.icon}
                title={entry.currency}
                description={entry.options.map((option) => option.networkName).join(' · ')}
                value={
                  single && isBusy(single) ? (
                    <ActivityIndicator />
                  ) : single ? (
                    `${single.amount} ${single.currency}`
                  ) : (
                    t('networkCount', { count: entry.options.length })
                  )
                }
                disabled={busy !== null}
                onPress={() => (single ? onChoose(single) : setCoin(entry.currency))}
              />
            );
          })}
        </RowGroup>
      ) : (
        <Text className="text-muted">{t('noCoins')}</Text>
      )}
      <Text variant="caption">{t('chooseCoinHint')}</Text>
      {onCancel ? <Button variant="ghost" label={t('keepCoin')} onPress={onCancel} /> : null}
    </View>
  );
}

interface CoinGroup {
  currency: string;
  icon?: string;
  options: EsimCryptoOption[];
}

/** The options by coin, in the gateway's order. */
function groupByCoin(options: EsimCryptoOption[]): CoinGroup[] {
  const groups = new Map<string, CoinGroup>();
  for (const option of options) {
    const group = groups.get(option.currency) ?? { currency: option.currency, options: [] };
    group.icon ??= option.currencyIcon;
    group.options.push(option);
    groups.set(option.currency, group);
  }
  return [...groups.values()];
}

/** A row like `NavRow`, led by a coin's or a network's picture. */
function PickRow({
  label,
  icon,
  title,
  description,
  value,
  disabled,
  onPress,
}: {
  label: string;
  icon?: string;
  title: string;
  description?: string;
  value: ReactNode;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, typeof value === 'string' ? value : null]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint={description}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-[56px] flex-row items-center gap-3 py-3 active:opacity-70 ${disabled ? 'opacity-50' : ''}`}>
      <CoinBadge label={label} icon={icon} />
      <View className="flex-1 gap-0.5">
        <Text variant="subheading">{title}</Text>
        {description ? (
          <Text variant="caption" numberOfLines={1}>
            {description}
          </Text>
        ) : null}
      </View>
      {typeof value === 'string' ? (
        <Text numberOfLines={1} className="max-w-[45%] text-muted">
          {value}
        </Text>
      ) : (
        value
      )}
      <Icon name="chevron-right" size={20} directional />
    </Pressable>
  );
}

/** A coin's or a network's picture (the network's small at its corner); its first letters when there is none. */
function CoinBadge({
  label,
  icon,
  networkIcon,
}: {
  label: string;
  icon?: string;
  networkIcon?: string;
}) {
  return (
    <View className="size-9" importantForAccessibility="no-hide-descendants">
      {icon ? (
        <AppImage
          image={icon}
          size="full"
          className="size-9 bg-transparent"
          contentFit="contain"
          decorative
        />
      ) : (
        <View className="size-9 items-center justify-center rounded-full bg-surface">
          <Text variant="label">{label.slice(0, 2).toUpperCase()}</Text>
        </View>
      )}
      {networkIcon ? (
        <View className="absolute -bottom-1 -end-1 rounded-full bg-background p-px">
          <AppImage
            image={networkIcon}
            size="full"
            className="size-4 rounded-full bg-transparent"
            contentFit="contain"
            decorative
          />
        </View>
      ) : null}
    </View>
  );
}

function Invoice({
  invoice,
  canChange,
  onChange,
}: {
  invoice: EsimCryptoInvoice;
  canChange: boolean;
  onChange: () => void;
}) {
  const t = useTranslations('esim.cryptoPay');
  const toast = useToast();
  const left = useSecondsLeft(invoice.expiresAt);

  const copy = (value: string) => {
    void setStringAsync(value).then(() => toast.show({ message: t('copied') }));
  };

  return (
    <View className="gap-4">
      <View className="gap-3 rounded-xl bg-surface p-4">
        <View className="flex-row items-center justify-between gap-3">
          <CoinBadge
            label={invoice.currency}
            icon={invoice.currencyIcon}
            networkIcon={invoice.networkIcon}
          />
          <Text variant="subheading" className="flex-1">
            {t('sendTitle', { currency: invoice.currency, network: invoice.networkName })}
          </Text>
          {left !== null ? (
            <Text variant="label" className={left < 120 ? 'text-danger' : 'text-muted'}>
              {clock(left)}
            </Text>
          ) : null}
        </View>
        <CopyField
          label={t('amount')}
          value={invoice.amount}
          suffix={invoice.currency}
          large
          onCopy={copy}
        />
        <View className="items-center gap-2 py-1">
          <View accessible accessibilityRole="image" accessibilityLabel={t('qrLabel')}>
            <AppImage
              image={invoice.qr}
              size="full"
              className="size-52 rounded-lg bg-background"
              contentFit="contain"
            />
          </View>
          <Text variant="caption" className="text-center">
            {t('scanHint')}
          </Text>
        </View>
        <CopyField label={t('address')} value={invoice.address} onCopy={copy} />
        <View className="flex-row gap-2 rounded-lg bg-background p-3">
          <Icon name="warning" size={18} />
          <Text variant="caption" className="flex-1 text-foreground">
            {t('warning', { currency: invoice.currency, network: invoice.networkName })}
          </Text>
        </View>
      </View>
      <View className="flex-row items-center justify-center gap-2">
        <ActivityIndicator />
        <Text className="text-muted">
          {invoice.state === 'confirming' ? t('confirming') : t('watching')}
        </Text>
      </View>
      {canChange ? <Button variant="outline" label={t('changeCoin')} onPress={onChange} /> : null}
    </View>
  );
}

function CopyField({
  label,
  value,
  suffix,
  large,
  onCopy,
}: {
  label: string;
  value: string;
  suffix?: string;
  large?: boolean;
  onCopy: (value: string) => void;
}) {
  const t = useTranslations('esim.cryptoPay');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}${suffix ? ` ${suffix}` : ''}`}
      accessibilityHint={t('copy')}
      onPress={() => onCopy(value)}
      className="flex-row items-center gap-3 rounded-lg border border-border p-3 active:opacity-70">
      <View className="flex-1 gap-0.5">
        <Text variant="caption">{label}</Text>
        <Text
          variant={large ? 'price-large' : 'body'}
          className={large ? undefined : 'font-mono'}
          selectable>
          {value}
          {suffix ? <Text className="text-muted"> {suffix}</Text> : null}
        </Text>
      </View>
      <Icon name="copy" size={18} />
    </Pressable>
  );
}

/** Seconds until `iso`, counted down every second; null without a time. */
function useSecondsLeft(iso: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [iso]);
  if (!iso) return null;
  return Math.max(0, Math.floor((new Date(iso).getTime() - now) / 1000));
}

function clock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
