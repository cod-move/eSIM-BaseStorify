import { router, type Href } from 'expo-router';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Icon, type IconName } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/press-motion';
import { NavRow, RowGroup } from '@/components/ui/rows';
import { Text } from '@/components/ui/text';
import { useCan } from '@/features/workspace/use-workspace';

import { HomeSection } from './home-section';

type QuickAction = { label: string; icon: IconName; href: Href };

/**
 * The workflows an operator starts most, at the foot of
 * Home's coloured header, as a banking app's actions: one white card each,
 * side by side, with the action's icon on a `primary` circle and its name
 * under it, as many as they may use.
 */
export function HomeQuickActions() {
  const t = useTranslations('home');
  const canCreate = useCan('CREATE_ORDERS');
  const canAdd = useCan('CREATE_PRODUCTS');
  const canScan = useCan('VIEW_PRODUCTS');
  const actions: QuickAction[] = [];
  if (canCreate) {
    actions.push({ label: t('createOrder'), icon: 'plus', href: '/orders/new' });
  }
  if (canAdd) actions.push({ label: t('addProduct'), icon: 'package-plus', href: '/products/new' });
  if (canScan) actions.push({ label: t('scan'), icon: 'scan-barcode', href: '/scanner' });
  if (!actions.length) return null;

  return (
    <View className="flex-row gap-3">
      {actions.map((action) => (
        <PressableScale
          key={action.href.toString()}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={() => router.push(action.href)}
          className="min-w-0 flex-1 items-center gap-2 rounded-[20px] bg-surface px-2 py-3 shadow-button active:opacity-90 dark:border dark:border-border">
          <View className="size-10 items-center justify-center rounded-full bg-primary">
            <Icon name={action.icon} size={20} colorClassName="accent-primary-foreground" />
          </View>
          <Text variant="chip" numberOfLines={2} className="text-center">
            {action.label}
          </Text>
        </PressableScale>
      ))}
    </View>
  );
}

/** Useful lower-priority links; no balances/counts derived from paginated lists. */
export function HomeBusinessLinks() {
  const t = useTranslations('home');
  const payouts = useCan('VIEW_PAYOUTS');
  const reviews = useCan('REVIEW_VENDOR_APPLICATIONS');
  if (!payouts && !reviews) return null;
  return (
    <HomeSection title={t('businessTitle')}>
      <RowGroup>
        {payouts ? (
          <NavRow icon="wallet" title={t('payouts')} onPress={() => router.push('/more/payouts')} />
        ) : null}
        {reviews ? (
          <NavRow
            icon="users"
            title={t('applications')}
            onPress={() => router.push('/more/applications')}
          />
        ) : null}
      </RowGroup>
    </HomeSection>
  );
}
