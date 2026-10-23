import { setStringAsync } from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { AppImage } from '@/components/ui/app-image';
import { StatusBadge } from '@/components/ui/badge';
import { TextLink } from '@/components/ui/button';
import { Divider } from '@/components/ui/divider';
import { IconButton } from '@/components/ui/icon-button';
import { SheetPanel, SheetStage } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import type { OrderLine } from '@/contracts/mobile/shop/v1';
import { ProductLink } from '@/features/catalog/product-link';
import { useOpenLink } from '@/features/config/use-open-link';

import type { Parcel } from './parcels';
import { TrackingSteps } from './tracking-steps';

type OrderSheetProps = { id: string; title: string; children: ReactNode };

/**
 * A tall sheet over the order, on the shared stage: the order dims
 * behind it. It slides out first, then the route closes under it. Closing goes
 * back where the shopper came from; opened from a link, it closes onto the order.
 */
export function OrderSheet({ id, title, children }: OrderSheetProps) {
  const router = useRouter();
  const tabBar = useTabBarHeight();
  const [open, setOpen] = useState(true);
  const leave = () =>
    router.canGoBack()
      ? router.back()
      : router.replace({ pathname: '/account/orders/[id]', params: { id } });
  const close = () => setOpen(false);

  return (
    <SheetStage open={open} onDismiss={close} onClosed={leave}>
      <SheetPanel title={title} onClose={close} size="tall">
        {children}
        <View style={{ height: tabBar }} />
      </SheetPanel>
    </SheetStage>
  );
}

/** The first line of a parcel, with the count of the others. */
function ParcelProduct({ lines }: { lines: OrderLine[] }) {
  const t = useTranslations('orders');
  const [first] = lines;
  if (!first) return null;
  const more = lines.slice(1).reduce((sum, line) => sum + line.quantity, 0);

  return (
    <ProductLink product={first} className="flex-row items-center gap-4">
      <View className="size-[70px] items-center justify-center rounded-lg bg-surface-alt">
        <AppImage image={first.image} size="thumb" className="size-[58px] rounded-md" />
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="subheading" numberOfLines={2}>
          {first.name}
        </Text>
        <Text variant="caption">{t('quantity', { count: first.quantity })}</Text>
        <Text variant="price">{first.lineTotal.formatted}</Text>
        {more > 0 ? <Text variant="caption">{t('moreItems', { count: more })}</Text> : null}
      </View>
    </ProductLink>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="min-h-11 flex-row items-center justify-between gap-3">
      <Text className="text-muted">{label}</Text>
      <View className="shrink flex-row items-center gap-1">{children}</View>
    </View>
  );
}

/** One parcel on the tracking sheet: what is in it, where to follow it, and its steps. */
export function ParcelCard({ parcel }: { parcel: Parcel }) {
  const t = useTranslations('orders');
  const toast = useToast();
  const openLink = useOpenLink();
  const { tracking } = parcel;
  const number = tracking?.number;

  const copy = (value: string) =>
    void setStringAsync(value).then(() => toast.show({ message: t('copied') }));

  return (
    <View className="gap-5 rounded-3xl bg-surface px-4 py-6">
      {parcel.shared ? (
        <View className="flex-row items-center justify-between gap-3">
          <Text variant="subheading" className="flex-1">
            {parcel.vendorName
              ? t('parcelFrom', { vendor: parcel.vendorName })
              : t('parcelFromSeller')}
          </Text>
          <StatusBadge status={parcel.status} />
        </View>
      ) : null}

      <ParcelProduct lines={parcel.lines} />
      <Divider />

      <View className="gap-1">
        <Text variant="subheading" className="mb-1">
          {t('orderDetails')}
        </Text>
        {number ? (
          <DetailRow label={t('trackingId')}>
            <Text className="font-bold" selectable>
              {number}
            </Text>
            <IconButton icon="copy" label={t('copyTrackingId')} onPress={() => copy(number)} />
          </DetailRow>
        ) : null}
        {tracking?.carrier ? (
          <DetailRow label={t('carrier')}>
            <Text className="font-bold">{tracking.carrier}</Text>
          </DetailRow>
        ) : null}
        {tracking?.url ? (
          <TextLink label={t('openCarrier')} onPress={() => openLink(tracking.url ?? '')} />
        ) : null}
        {!tracking ? <Text className="text-muted">{t('noTracking')}</Text> : null}
        {tracking?.exception ? (
          <View className="mt-2 gap-0.5 rounded-lg border border-danger p-3">
            <Text variant="label" className="text-danger">
              {t('deliveryProblem')}
            </Text>
            <Text>{tracking.exception.message}</Text>
          </View>
        ) : null}
      </View>
      <Divider />

      <View className="gap-4">
        <Text variant="subheading">{t('orderStatus')}</Text>
        <TrackingSteps steps={parcel.steps} />
      </View>
    </View>
  );
}
