import { router, type Href } from 'expo-router';
import { useCallback } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useTranslations } from 'use-intl';

import { CountBadge } from '@/components/ui/badge';
import type { IconName } from '@/components/ui/icon';
import { IconCircle } from '@/components/ui/icon-circle';
import { PressableScale } from '@/components/ui/press-motion';
import type { StatusTone } from '@/components/ui/status-chip';
import { Text } from '@/components/ui/text';
import { useHome } from '@/features/home/use-home';
import { usePayoutSummary } from '@/features/more/use-payouts';
import { useCan } from '@/features/workspace/use-workspace';
import { cn } from '@/lib/cn';

/** Past this text size, two cards side by side no longer fit their words: one per row. */
const ONE_PER_ROW_SCALE = 1.35;

type Tool = {
  icon: IconName;
  tone: StatusTone;
  label: string;
  /** What is waiting there, or what it is for. */
  status: string;
  count?: number;
  to: Href;
};

/**
 * The Account tab's tools: what is not a tab, as the operator may use it, each
 * saying what waits there. Open returns are Home's own count (GET /home,
 * usually cached already); the amount ready to pay is the payout summary's.
 * `refetch` reads both again for the tab's pull to refresh.
 */
export function useAccountTools() {
  const t = useTranslations('more');
  const canReturns = useCan('VIEW_RETURNS');
  const canCustomers = useCan('VIEW_ORDER_CUSTOMERS');
  const canScan = useCan('VIEW_PRODUCTS');
  const canPayouts = useCan('VIEW_PAYOUTS');
  const canApplications = useCan('REVIEW_VENDOR_APPLICATIONS');
  const home = useHome();
  const summary = usePayoutSummary();
  const openReturns = home.data?.tiles.find((tile) => tile.kind === 'OPEN_RETURNS')?.count;
  // Not "ready to pay" when the store says it cannot be paid out now.
  const ready = summary.data?.eligible === false ? undefined : summary.data?.readyToPay;

  const tools = [
    canReturns && {
      icon: 'return',
      tone: openReturns ? 'warning' : 'neutral',
      label: t('returns'),
      status:
        openReturns === undefined ? t('returnsHint') : t('returnsOpen', { count: openReturns }),
      count: openReturns,
      // The count is of open returns: the list opens on them.
      to: { pathname: '/returns', params: { tab: 'open' } },
    },
    canCustomers && {
      icon: 'users',
      tone: 'info',
      label: t('customers'),
      status: t('customersHint'),
      to: '/customers',
    },
    canScan && {
      icon: 'scan-barcode',
      tone: 'neutral',
      label: t('scan'),
      status: t('scanHint'),
      to: '/scanner',
    },
    canPayouts && {
      icon: 'wallet',
      tone: 'success',
      label: t('payouts'),
      status: ready ? t('payoutsReady', { amount: ready.formatted }) : t('payoutsHint'),
      to: '/more/payouts',
    },
    canApplications && {
      icon: 'file-text',
      tone: 'neutral',
      label: t('applications'),
      status: t('applicationsHint'),
      to: '/more/applications',
    },
  ].filter(Boolean) as Tool[];

  const { refetch: readHome } = home;
  const { refetch: readSummary } = summary;
  const refetch = useCallback(
    () =>
      Promise.allSettled([
        ...(canReturns ? [readHome()] : []),
        ...(canPayouts ? [readSummary()] : []),
      ]),
    [canReturns, canPayouts, readHome, readSummary]
  );

  return { tools, refetch };
}

/**
 * The tools as cards, two to a row (one at the largest text sizes): an icon
 * circle, the tool's name and what waits there. A last card alone takes the
 * whole row. Each card is one button; its status is read as its value.
 */
export function AccountTools({ tools }: { tools: Tool[] }) {
  const { fontScale } = useWindowDimensions();
  const stack = fontScale >= ONE_PER_ROW_SCALE;
  if (!tools.length) return null;

  return (
    <View className="flex-row flex-wrap gap-2.5">
      {tools.map((tool) => (
        <PressableScale
          key={tool.label}
          accessibilityRole="button"
          accessibilityLabel={tool.label}
          accessibilityValue={{ text: tool.status }}
          onPress={() => router.push(tool.to)}
          className={cn(
            'min-h-[104px] grow gap-3 rounded-xl bg-surface p-4 active:opacity-80 dark:border dark:border-border',
            stack ? 'basis-full' : 'basis-[40%]'
          )}>
          <View className="flex-row items-start justify-between">
            <IconCircle icon={tool.icon} tone={tool.tone} size="md" />
            <CountBadge count={tool.count ?? 0} />
          </View>
          <View className="gap-0.5">
            <Text variant="label" numberOfLines={2}>
              {tool.label}
            </Text>
            <Text variant="meta" numberOfLines={2}>
              {tool.status}
            </Text>
          </View>
        </PressableScale>
      ))}
    </View>
  );
}
