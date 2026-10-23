import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { NavRow, RowGroup } from '@/components/ui/rows';
import { SectionHeader } from '@/components/ui/section-header';
import { Sheet, SheetActions } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useSignOut } from '@/features/auth/use-sign-out';

import { AccountBell } from './account-bell';
import { AccountPicture, Avatar, QuickTile, Tile } from './account-parts';
import { PolicyRows } from './policy-rows';
import { MessagesTile } from './tiles/messages-tile';
import { usePreferencesRow } from './tiles/preferences-row';
import { ReturnsTile } from './tiles/returns-tile';
import { ReviewsTile } from './tiles/reviews-tile';

const WISHLIST = '/account/wishlist';
const ORDERS = '/account/orders';
const ADDRESSES = '/account/addresses';
const PROMOS = '/account/promos';
const TRACKING = '/account/tracking';
const HELP = '/account/help';

type Shopper = { name: string; imageUrl: string | undefined };

/** The signed-in Account tab. */
export function ShopperAccount({ shopper }: { shopper: Shopper }) {
  const t = useTranslations('account');
  const router = useRouter();
  const go = (href: Href) => () => router.push(href);
  const preferencesRow = usePreferencesRow();

  return (
    <View className="gap-5">
      <View className="flex-row items-center gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('welcome')} ${shopper.name}`}
          accessibilityHint={t('profile')}
          onPress={go('/account/profile')}
          className="flex-1 flex-row items-center gap-3 active:opacity-80">
          <Avatar imageUrl={shopper.imageUrl} size="md" />
          <View className="flex-1 gap-0.5">
            <Text variant="caption" className="text-foreground">
              {t('welcome')}
            </Text>
            <Text variant="subheading" numberOfLines={1}>
              {shopper.name}
            </Text>
          </View>
        </Pressable>
        <AccountBell />
        <MessagesTile />
      </View>

      <View className="flex-row gap-2.5">
        <QuickTile picture="wishlist" label={t('wishlist')} onPress={go(WISHLIST)} />
        <View className="flex-1">
          <ReviewsTile />
        </View>
        <QuickTile picture="coupons" label={t('coupons')} onPress={go(PROMOS)} />
        <QuickTile picture="help" label={t('help')} onPress={go(HELP)} />
      </View>

      <View className="gap-3">
        {/* Over the wash, "View All" is `foreground`: the `link` colour loses its contrast there. */}
        <SectionHeader title={t('purchases')} onViewAll={go(ORDERS)} linkTone="foreground" />
        <View className="flex-row rounded-xl bg-surface">
          <View className="flex-1">
            <Tile picture="orders" label={t('orderHistory')} onPress={go(ORDERS)} />
          </View>
          <ReturnsTile />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('trackOrders')}
          onPress={go(TRACKING)}
          className="min-h-14 flex-row items-center gap-3 rounded-xl bg-surface px-5 py-3 active:opacity-80">
          <AccountPicture name="tracking" className="size-7" />
          <Text variant="subheading" className="flex-1">
            {t('trackOrders')}
          </Text>
          <Icon name="chevron-right" size={20} directional />
        </Pressable>
      </View>

      <RowGroup>
        <NavRow icon="user" title={t('profile')} onPress={go('/account/profile')} />
        {preferencesRow}
        <NavRow icon="pin" title={t('addresses')} onPress={go(ADDRESSES)} />
        <NavRow icon="shield" title={t('security')} onPress={go('/account/security')} />
        <NavRow icon="appearance" title={t('settings')} onPress={go('/account/settings')} />
      </RowGroup>

      <PolicyRows />

      <SignOutGroup />
    </View>
  );
}

/** The Account tab for a guest: a way to sign in, and the app's settings. */
export function GuestAccount() {
  const t = useTranslations('account');
  const router = useRouter();

  return (
    <View className="gap-5">
      <View className="flex-row items-center gap-3">
        <Avatar imageUrl={undefined} size="md" />
        <View className="flex-1 gap-0.5">
          <Text variant="caption" className="text-foreground">
            {t('welcome')}
          </Text>
          <Text variant="subheading">{t('guest')}</Text>
        </View>
      </View>
      <View className="gap-4 rounded-xl bg-surface p-5">
        <Text>{t('guestBody')}</Text>
        <Button label={t('signIn')} onPress={() => router.push('/login')} />
      </View>
      <RowGroup>
        <NavRow icon="help" title={t('help')} onPress={() => router.push(HELP)} />
        <NavRow
          icon="appearance"
          title={t('settings')}
          onPress={() => router.push('/account/settings')}
        />
      </RowGroup>
      <PolicyRows />
    </View>
  );
}

/** "Sign Out" in a group of its own, behind a confirmation. */
function SignOutGroup() {
  const t = useTranslations('account');
  const { signOut, isPending } = useSignOut();
  const [asking, setAsking] = useState(false);

  return (
    <>
      <RowGroup>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('signOut')}
          onPress={() => setAsking(true)}
          className="min-h-[52px] flex-row items-center gap-3 py-3.5 active:opacity-70">
          <Icon name="sign-out" size={22} colorClassName="accent-danger" />
          <Text variant="subheading" className="text-danger">
            {t('signOut')}
          </Text>
        </Pressable>
      </RowGroup>
      <Sheet
        visible={asking}
        title={t('signOutTitle')}
        onClose={() => setAsking(false)}
        footer={
          <SheetActions>
            <Button label={t('cancel')} variant="secondary" onPress={() => setAsking(false)} />
            <Button
              label={t('signOutConfirm')}
              variant="danger"
              loading={isPending}
              onPress={() => void signOut().finally(() => setAsking(false))}
            />
          </SheetActions>
        }>
        <Text>{t('signOutBody')}</Text>
      </Sheet>
    </>
  );
}
