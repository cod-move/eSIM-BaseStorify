import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Avatar, LogoTile } from '@/components/ui/avatar';
import { Icon, type IconName } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { NavRow, RowGroup } from '@/components/ui/rows';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { AppearanceRow, LanguageRow } from '@/features/account/preferences';
import { SignOutRow } from '@/features/account/sign-out-row';
import { TwoStepNudge } from '@/features/account/two-step-nudge';
import { useConfig } from '@/features/config/use-config';
import { PushOffBanner } from '@/features/devices/push-banner';
import { PushRow } from '@/features/devices/push-row';
import { useBrandStatusBar } from '@/features/home/use-brand-status-bar';
import { useConversations } from '@/features/inbox/use-inbox';
import { useNotifications } from '@/features/more/use-notifications';
import { useCan, useWorkspace } from '@/features/workspace/use-workspace';
import { useMe } from '@/features/workspace/use-me';
import { VendorNotice } from '@/features/workspace/vendor-notice';
import { useWorkspaceLabel } from '@/features/workspace/workspace-label';
import { WorkspaceSheet } from '@/features/workspace/workspace-sheet';
import { appInfo } from '@/lib/device';
import { usePullToRefresh } from '@/lib/use-pull-to-refresh';
import { useRefetchOnFocus } from '@/lib/use-refetch-on-focus';

import { AccountTools, useAccountTools } from './account-tools';

/**
 * The Account tab, the operator's hub, on Home's colour
 * fading down the screen (the `brand` wash): who and where they are (picture, name, role and
 * workspace; opens Account), the notifications and messages with their counts
 * at the end; switching workspace, with two; what needs them (a closed shop,
 * notifications off on this phone, two-step verification off); the tools that
 * are not tabs, each saying what waits there; their settings; the website;
 * and signing out. Read again on each return to it, and on a pull.
 */
export function MoreScreen() {
  const t = useTranslations('more');
  const common = useTranslations('common');
  const account = useTranslations('account');
  const me = useMe();
  const config = useConfig();
  const state = useWorkspace();
  const label = useWorkspaceLabel();
  const canInbox = useCan('VIEW_INBOX');
  const notifications = useNotifications();
  const { tools, refetch: readTools } = useAccountTools();
  const [switching, setSwitching] = useState(false);
  const person = me.data;
  const store = config.data?.store;
  const workspace = state.status === 'ready' ? label(state.access) : null;
  const canSwitch = state.status === 'ready' && state.workspaces.length > 1;
  const where = workspace ? [workspace.role, workspace.name].join(common('separator')) : null;

  const { refetch: readMe } = me;
  const { refetch: readNotifications } = notifications;
  const refresh = useCallback(
    () => Promise.allSettled([readMe(), readNotifications(), readTools()]),
    [readMe, readNotifications, readTools]
  );
  useRefetchOnFocus(refresh);
  const pull = usePullToRefresh(refresh);
  useBrandStatusBar();

  return (
    <Screen
      wash="brand"
      scroll
      refreshing={pull.refreshing}
      onRefresh={pull.onRefresh}
      contentClassName="gap-4 px-4 pt-safe-offset-4">
      <View className="flex-row items-center gap-3">
        {person ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={[person.name, where].filter(Boolean).join(', ')}
            accessibilityHint={t('accountHint')}
            onPress={() => router.push('/more/account')}
            className="flex-1 flex-row items-center gap-3 active:opacity-80">
            <View className="rounded-full bg-surface p-[3px] shadow-button">
              <Avatar name={person.name} imageUrl={person.imageUrl} size="lg" />
            </View>
            <View className="flex-1 gap-0.5">
              <Text
                variant="subheading"
                accessibilityRole="header"
                numberOfLines={1}
                className="text-primary-foreground">
                {person.name}
              </Text>
              {where ? (
                <Text variant="meta" numberOfLines={2} className="text-primary-foreground/80">
                  {where}
                </Text>
              ) : null}
            </View>
          </Pressable>
        ) : (
          <Text
            variant="title-large"
            accessibilityRole="header"
            className="flex-1 text-primary-foreground">
            {t('title')}
          </Text>
        )}
        <IconButton
          icon="bell"
          variant="onBrand"
          label={t('notifications')}
          count={notifications.data?.unreadCount ?? 0}
          onPress={() => router.push('/more/notifications')}
        />
        {canInbox ? <MessagesButton /> : null}
      </View>

      {workspace && canSwitch ? (
        <RowGroup>
          <NavRow
            leading={<LogoTile logo={workspace.logo} icon={workspace.icon} size="md" />}
            title={workspace.name}
            description={workspace.scope ?? workspace.role}
            value={t('switch')}
            onPress={() => setSwitching(true)}
          />
        </RowGroup>
      ) : null}

      <VendorNotice />
      <PushOffBanner />
      <TwoStepNudge />

      <AccountTools tools={tools} />

      <RowGroup title={t('settings')}>
        {person ? (
          <NavRow
            icon="user"
            title={t('account')}
            description={person.email}
            accessibilityLabel={
              person.twoFactorEnabled ? t('account') : [t('account'), t('twoStepOff')].join(', ')
            }
            trailing={
              person.twoFactorEnabled ? undefined : (
                <Icon name="warning" size={20} colorClassName="accent-warning" />
              )
            }
            onPress={() => router.push('/more/account')}
          />
        ) : null}
        <PushRow />
        <LanguageRow />
        <AppearanceRow />
      </RowGroup>

      {store ? (
        <RowGroup>
          {store.dashboardUrl ? (
            <BrowserRow
              icon="globe"
              title={t('website')}
              description={t('websiteHint')}
              url={store.dashboardUrl}
            />
          ) : null}
          <BrowserRow
            icon="store"
            title={t('storefront')}
            description={t('storefrontHint')}
            url={store.websiteUrl}
          />
        </RowGroup>
      ) : null}

      <View className="gap-3">
        <RowGroup>
          <SignOutRow />
        </RowGroup>
        <Text variant="caption" className="text-center">
          {account('version', { version: appInfo.version })}
        </Text>
      </View>

      <WorkspaceSheet visible={switching} onClose={() => setSwitching(false)} />
    </Screen>
  );
}

/** The inbox, with its unread count, at the header's end: only for an operator who may read it. */
function MessagesButton() {
  const t = useTranslations('more');
  const unread = useConversations().data?.unreadCount ?? 0;
  return (
    <IconButton
      icon="chat"
      variant="onBrand"
      label={t('messages')}
      count={unread}
      onPress={() => router.push('/(tabs)/inbox')}
    />
  );
}

/**
 * A page of the store's own website, opened in the phone's browser: the
 * whole dashboard or storefront, with the operator's browser sign-in, rather
 * than squeezed into the app. The mark at the end says it leaves the app.
 */
function BrowserRow({
  icon,
  title,
  description,
  url,
}: {
  icon: IconName;
  title: string;
  description: string;
  url: string;
}) {
  const common = useTranslations('common');

  return (
    <NavRow
      icon={icon}
      title={title}
      description={description}
      accessibilityRole="link"
      accessibilityHint={common('opensInBrowser')}
      chevron={false}
      trailing={<Icon name="external-link" size={18} colorClassName="accent-muted" directional />}
      onPress={() => void Linking.openURL(url).catch(() => undefined)}
    />
  );
}
