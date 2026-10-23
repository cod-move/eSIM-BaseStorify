import { Stack, useRouter, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { HeaderButton } from '@/components/shell/app-header';
import { usePinnedPanelPadding } from '@/components/shell/tab-bar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ErrorState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { useSession } from '@/features/auth/use-session';
import { PushPermissionMoment } from '@/features/notifications/push-permission-moment';
import { guestContactOf } from '@/features/orders/guest-contact';
import { ReceiptButton } from '@/features/orders/receipt-button';
import type { ReceiptSource } from '@/features/orders/use-receipt';

import type { PaymentResult } from './success-params';
import { usePaymentOutcome } from './use-payment-outcome';

/** The checkout's path, the store website's. */
const CHECKOUT: Href = '/checkout';

type Told<K extends PaymentResult['outcome']> = Extract<PaymentResult, { outcome: K }>;

/** The content centred, and "Continue Shopping" pinned at the bottom, above the tab bar's fade. */
function Frame({ children }: { children: ReactNode }) {
  const t = useTranslations('payments');
  const router = useRouter();
  const bottom = usePinnedPanelPadding();

  return (
    <View className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center px-6">
        <View className="max-w-[320px] items-center gap-3">{children}</View>
      </View>
      <View className="px-4" style={{ paddingBottom: bottom }}>
        <Button
          variant="accent"
          label={t('continueShopping')}
          onPress={() => router.replace('/')}
        />
      </View>
    </View>
  );
}

/** The design's check is `success`, not grey; a payment that failed gets a `danger` cross. */
function Mark({ failed = false }: { failed?: boolean }) {
  return (
    <View className="mb-3 size-[114px] items-center justify-center rounded-full bg-surface">
      <Icon
        name={failed ? 'close' : 'check'}
        size={56}
        colorClassName={failed ? 'accent-danger' : 'accent-success'}
        strokeWidth={2.5}
      />
    </View>
  );
}

/** Paid by card, or placed for cash on delivery: the same screen, with its own words. */
function Placed({ result }: { result: Told<'placed' | 'paid'> }) {
  const t = useTranslations('payments');
  const router = useRouter();
  // A guest has no orders to open: the number and what to do with it are all they get.
  const { isSignedIn } = useSession();
  const paid = result.outcome === 'paid';
  // A guest's receipt is found by the order number and the contact they placed it with.
  const guestContact = isSignedIn ? undefined : guestContactOf(result.orderNumber);
  const receipt: ReceiptSource | undefined = guestContact
    ? { guest: { orderNumber: result.orderNumber, contact: guestContact } }
    : isSignedIn && result.orderId
      ? { orderId: result.orderId }
      : undefined;
  const orderHref: Href = result.orderId
    ? { pathname: '/account/orders/[id]', params: { id: result.orderId } }
    : '/account/orders';

  return (
    <Frame>
      <Mark />
      <Text variant="display" className="text-center">
        {t(paid ? 'paid.title' : 'placed.title')}
      </Text>
      <Text className="text-center text-muted">{t(paid ? 'paid.text' : 'placed.text')}</Text>
      <Text variant="subheading" className="text-center">
        {t('orderNumber', { number: result.orderNumber })}
      </Text>
      {isSignedIn ? (
        <View className="mt-5 self-stretch">
          <Button label={t('viewOrder')} onPress={() => router.replace(orderHref)} />
        </View>
      ) : (
        <Text className="text-center text-muted">{t('guestNote')}</Text>
      )}
      {receipt ? <ReceiptButton source={receipt} /> : null}
      <PushPermissionMoment />
    </Frame>
  );
}

function Failed({ result }: { result: Told<'failed'> }) {
  const t = useTranslations('payments');
  const router = useRouter();
  // A sheet that failed says why in Stripe's own words.
  const text =
    result.reason === 'sheet' && result.message ? result.message : t(`failed.${result.reason}`);
  // The cart is kept: going back to checkout is another try. A sold-out or returned payment has nothing to retry.
  const canChoose = result.reason !== 'soldOut' && result.reason !== 'returned';

  return (
    <Frame>
      <Mark failed />
      <Text variant="display" className="text-center">
        {t('failed.title')}
      </Text>
      <Text className="text-center text-muted">{text}</Text>
      {canChoose ? (
        <View className="mt-5 self-stretch">
          <Button label={t('chooseAnother')} onPress={() => router.replace(CHECKOUT)} />
        </View>
      ) : null}
    </Frame>
  );
}

/** The bank is still processing: the store is asked until it knows, then the shopper may ask again. */
function Waiting({ stuck, onCheck }: { stuck: boolean; onCheck: () => void }) {
  const t = useTranslations('payments');

  return (
    <Frame>
      {stuck ? null : <ActivityIndicator colorClassName="accent-muted" />}
      <Text variant="display" className="text-center">
        {t(stuck ? 'stuck.title' : 'pending.title')}
      </Text>
      <Text className="text-center text-muted">{t(stuck ? 'stuck.text' : 'pending.text')}</Text>
      {stuck ? (
        <View className="mt-5 self-stretch">
          <Button label={t('stuck.check')} onPress={onCheck} />
        </View>
      ) : null}
    </Frame>
  );
}

function Outcome({ result }: { result: PaymentResult }) {
  switch (result.outcome) {
    case 'placed':
    case 'paid':
      return <Placed result={result} />;
    case 'failed':
      return <Failed result={result} />;
    case 'pending':
      return <Pending paymentIntentId={result.paymentIntentId} />;
  }
}

function Pending({ paymentIntentId }: { paymentIntentId: string }) {
  const { result, stuck, error, check } = usePaymentOutcome(paymentIntentId);
  if (result) return <Outcome result={result} />;
  if (error) return <ErrorState error={error} onRetry={check} />;
  return <Waiting stuck={stuck} onCheck={check} />;
}

/** How a payment ended: the header is "Payment" with a close, no back. */
export function OutcomeScreen({ result }: { result: PaymentResult }) {
  const t = useTranslations('payments');
  const common = useTranslations('common');
  const router = useRouter();

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t('title'),
          headerBackVisible: false,
          headerRight: () => (
            <HeaderButton
              icon="close"
              label={common('close')}
              onPress={() => router.replace('/')}
            />
          ),
        }}
      />
      <Outcome result={result} />
    </>
  );
}
