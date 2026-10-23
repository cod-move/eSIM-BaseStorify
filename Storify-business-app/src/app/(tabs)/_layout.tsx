import { Tabs } from 'expo-router/js-tabs';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';

import { TabBar } from '@/components/shell/tab-bar';
import { PushMoment } from '@/features/devices/push-moment';
import { useConversations } from '@/features/inbox/use-inbox';
import { useNotifications } from '@/features/more/use-notifications';
import { showsTab, TABS } from '@/features/shell/tabs';
import { useWorkspace } from '@/features/workspace/use-workspace';

/**
 * The five tabs. A tab shows only with its capability
 * from GET /me: without it the route does not exist (`Tabs.Protected`), so a
 * link to it opens Home, and the API refuses anyway. The bar floats over the
 * screens, which leave room for it at the bottom (`useBottomSpace`).
 */
export default function TabsLayout() {
  const t = useTranslations('tabs');
  const state = useWorkspace();
  const capabilities = state.status === 'ready' ? state.access.capabilities : [];
  const shown = new Set(TABS.filter((tab) => showsTab(tab, capabilities)).map((tab) => tab.route));
  const [unreadConversations, setUnreadConversations] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const items = TABS.filter((tab) => shown.has(tab.route)).map((tab) => ({
    route: tab.route,
    icon: tab.icon,
    label: t(tab.label),
    count: tab.route === 'inbox' ? unreadConversations : 0,
    dot: tab.route === 'more' && unreadNotifications > 0,
  }));

  return (
    <>
      <Tabs
        tabBar={(props) => <TabBar {...props} items={items} />}
        screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="index" options={{ title: t('home') }} />
        <Tabs.Protected guard={shown.has('orders')}>
          <Tabs.Screen name="orders" options={{ title: t('orders') }} />
        </Tabs.Protected>
        <Tabs.Protected guard={shown.has('products')}>
          <Tabs.Screen name="products" options={{ title: t('products') }} />
        </Tabs.Protected>
        <Tabs.Protected guard={shown.has('inbox')}>
          <Tabs.Screen name="inbox" options={{ title: t('inbox') }} />
        </Tabs.Protected>
        <Tabs.Screen name="more" options={{ title: t('account') }} />
      </Tabs>
      {/* The badges' counts, asked for only where the operator may see them. */}
      {shown.has('inbox') ? <UnreadConversations onCount={setUnreadConversations} /> : null}
      <UnreadNotifications onCount={setUnreadNotifications} />
      {/* Asks once whether the app may send notifications, now the operator is at work. */}
      <PushMoment />
    </>
  );
}

/** The Inbox tab's badge: every conversation's unread messages (GET /conversations). */
function UnreadConversations({ onCount }: { onCount: (count: number) => void }) {
  const count = useConversations().data?.unreadCount ?? 0;
  useEffect(() => {
    onCount(count);
    return () => onCount(0);
  }, [count, onCount]);
  return null;
}

/** The Account tab's dot: the account's unread notifications (GET /notifications). */
function UnreadNotifications({ onCount }: { onCount: (count: number) => void }) {
  const count = useNotifications().data?.unreadCount ?? 0;
  useEffect(() => {
    onCount(count);
  }, [count, onCount]);
  return null;
}
