import { router } from 'expo-router';
import { Linking, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Price } from '@/components/ui/price';
import { ActionRow, RowGroup, ValueRow } from '@/components/ui/rows';
import { Screen, StackHeader } from '@/components/ui/screen';
import { ErrorState, InlineError, LoadingState } from '@/components/ui/state-view';
import { StatusChip } from '@/components/ui/status-chip';
import { Text } from '@/components/ui/text';
import type { CustomerDetail, OrderAddress } from '@/contracts/mobile/biz/v1';
import { ConversationRow } from '@/features/inbox/conversation-row';
import { useConversations } from '@/features/inbox/use-inbox';
import { OrderRow } from '@/features/orders/order-row';
import { useOrders } from '@/features/orders/use-orders';
import { useCan } from '@/features/workspace/use-workspace';
import { useShortDate } from '@/i18n/use-list-time';
import { usePullToRefresh } from '@/lib/use-pull-to-refresh';

import { CustomerNotes } from './customer-notes';
import { useCustomer, useRefreshCustomer } from './use-customers';

/** How many of their orders and conversations the profile shows before "See all". */
const RECENT = 3;

/** An address as lines, each line's parts joined the language's way (`common.listSeparator`). */
function addressLines(address: OrderAddress, separator: string): string[] {
  return [
    address.name,
    [address.street, address.apartment].filter(Boolean).join(separator),
    [address.city, address.state, address.postalCode, address.country]
      .filter(Boolean)
      .join(separator),
    address.phone,
  ].filter((line): line is string => Boolean(line));
}

/**
 * A customer, on the profile wash, as the store sends
 * them (GET /customers/{id}): their picture, name and kind; Email and Call;
 * the store's figures from the orders the operator sees (never added up
 * here); contact details and addresses; their latest orders and
 * conversations, each with a way to all of them; and the business's notes,
 * with the notes permission.
 */
export function CustomerProfileScreen({ id }: { id: string }) {
  const t = useTranslations('customers');
  const common = useTranslations('common');
  const query = useCustomer(id);
  const canOrders = useCan('VIEW_ORDERS');
  const canInbox = useCan('VIEW_INBOX');
  const pull = usePullToRefresh(useRefreshCustomer(id));
  const customer = query.data;
  const header = <StackHeader title={t('profileTitle')} icon="user" />;

  if (!customer) {
    return (
      <Screen header={header} wash="profile">
        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <LoadingState shape="spinner" />
        )}
      </Screen>
    );
  }

  return (
    <Screen
      header={header}
      wash="profile"
      scroll
      refreshing={pull.refreshing}
      onRefresh={pull.onRefresh}
      contentClassName="gap-4 px-4 pt-2">
      <Identity customer={customer} />
      <Summary customer={customer} />

      <RowGroup title={t('contact')}>
        <ValueRow label={t('name')} value={customer.name} />
        {customer.email ? <ValueRow label={t('emailLabel')} value={customer.email} /> : null}
        {customer.phone ? <ValueRow label={t('phone')} value={customer.phone} /> : null}
      </RowGroup>

      {customer.addresses.length ? (
        <RowGroup title={t('addresses')}>
          {customer.addresses.map((address, index) => (
            <View key={index} className="gap-0.5 px-4 py-3">
              {addressLines(address, common('listSeparator')).map((line, lineIndex) => (
                <Text key={lineIndex} variant={lineIndex === 0 ? 'label' : 'body'}>
                  {line}
                </Text>
              ))}
            </View>
          ))}
        </RowGroup>
      ) : null}

      {canOrders ? <RecentOrders id={id} /> : null}
      {canInbox ? <RecentConversations id={id} /> : null}
      <CustomerNotes id={id} />
    </Screen>
  );
}

function Identity({ customer }: { customer: CustomerDetail }) {
  const t = useTranslations('customers');
  const { email, phone } = customer;
  return (
    <>
      <View className="items-center gap-1 pb-1">
        <View className="rounded-full bg-surface p-1 shadow-button">
          <Avatar name={customer.name} imageUrl={customer.imageUrl} size="lg" />
        </View>
        <Text variant="title-large" accessibilityRole="header" className="pt-2 text-center">
          {customer.name}
        </Text>
        <StatusChip
          tone={customer.kind === 'account' ? 'info' : 'neutral'}
          label={t(`kinds.${customer.kind}`)}
        />
      </View>
      {email || phone ? (
        <View className="flex-row gap-3">
          {email ? (
            <Button
              label={t('email')}
              icon="mail"
              variant="secondary"
              className="flex-1"
              onPress={() => void Linking.openURL(`mailto:${email}`)}
            />
          ) : null}
          {phone ? (
            <Button
              label={t('call')}
              icon="phone"
              variant="secondary"
              className="flex-1"
              onPress={() => void Linking.openURL(`tel:${phone}`)}
            />
          ) : null}
        </View>
      ) : null}
    </>
  );
}

/**
 * The store's figures: how many orders, what was paid (one amount per
 * currency, each as the store wrote it), the first and the latest order.
 */
function Summary({ customer }: { customer: CustomerDetail }) {
  const t = useTranslations('customers.summary');
  const common = useTranslations('common');
  const format = useFormatter();
  const date = useShortDate();
  const { orderCount, totalSpent, firstOrderAt, lastOrderAt } = customer.summary;
  const dates = [
    firstOrderAt ? t('first', { date: date(firstOrderAt) }) : null,
    lastOrderAt ? t('latest', { date: date(lastOrderAt) }) : null,
  ].filter((line): line is string => Boolean(line));
  const spent = totalSpent.map((money) => money.formatted);

  return (
    <View
      accessible
      accessibilityLabel={[
        t('orders'),
        format.number(orderCount),
        t('spent'),
        spent.length ? spent.join(common('listSeparator')) : t('nothingPaid'),
        ...dates,
      ].join(common('listSeparator'))}
      className="gap-3 rounded-xl bg-surface p-4">
      <View className="flex-row gap-4">
        <View className="flex-1 gap-1">
          <Text variant="meta">{t('orders')}</Text>
          <Text variant="price-large">{format.number(orderCount)}</Text>
        </View>
        <View className="flex-1 gap-1">
          <Text variant="meta">{t('spent')}</Text>
          {totalSpent.length ? (
            totalSpent.map((money) => (
              <Price key={money.currency} money={money} variant="price-large" />
            ))
          ) : (
            <Text variant="body" className="text-muted">
              {t('nothingPaid')}
            </Text>
          )}
        </View>
      </View>
      {dates.length ? <Text variant="meta">{dates.join(common('separator'))}</Text> : null}
      <Text variant="caption">{t('scope')}</Text>
    </View>
  );
}

function RecentOrders({ id }: { id: string }) {
  const t = useTranslations('customers');
  const orders = useOrders({ tab: 'all', customerId: id });
  if (orders.isPending) return <LoadingState shape="rows" rows={RECENT} />;
  if (orders.isError && !orders.data) {
    return <InlineError error={orders.error} onRetry={() => void orders.refetch()} />;
  }
  const items = orders.data ?? [];
  return (
    <RowGroup title={t('orders')}>
      {items.length === 0 ? (
        <Text variant="meta" className="px-4 pb-4">
          {t('noOrders')}
        </Text>
      ) : null}
      {items.slice(0, RECENT).map((order) => (
        <OrderRow key={order.id} order={order} />
      ))}
      {items.length > 0 ? (
        <ActionRow
          icon="receipt"
          title={t('allOrders')}
          onPress={() => router.push({ pathname: '/customers/[id]/orders', params: { id } })}
        />
      ) : null}
    </RowGroup>
  );
}

function RecentConversations({ id }: { id: string }) {
  const t = useTranslations('customers');
  const list = useConversations({ customerId: id });
  if (list.isPending) return <LoadingState shape="rows" rows={2} />;
  if (list.isError && !list.data) {
    return <InlineError error={list.error} onRetry={() => void list.refetch()} />;
  }
  const items = list.data?.items ?? [];
  return (
    <View className="gap-2">
      <Text variant="heading" accessibilityRole="header" className="px-1 pt-2">
        {t('conversations')}
      </Text>
      {items.length === 0 ? (
        <Text variant="meta" className="px-1">
          {t('noConversations')}
        </Text>
      ) : null}
      {items.slice(0, RECENT).map((conversation) => (
        <ConversationRow
          key={conversation.id}
          conversation={conversation}
          onPress={() =>
            router.push({ pathname: '/conversations/[id]', params: { id: conversation.id } })
          }
        />
      ))}
    </View>
  );
}
