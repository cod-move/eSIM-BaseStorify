import { Stack } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { LoadingState } from '@/components/ui/state-view';
import { Wash } from '@/features/account/account-parts';
import { GuestAccount, ShopperAccount } from '@/features/account/account-home';
import { useMe } from '@/features/account/use-me';
import { useSession } from '@/features/auth/use-session';

const SCREEN_OPTIONS = { headerShown: false };

/**
 * The Account tab, over its wash. A shopper's name shows from the session at
 * once; the profile, when it arrives, adds the picture and any newer name.
 */
export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const { user, isPending } = useSession();
  const me = useMe(Boolean(user));

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={SCREEN_OPTIONS} />
      <Wash name="account" />
      {isPending ? (
        <LoadingState />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-4"
          contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: tabBarHeight + 16 }}>
          {user ? (
            <ShopperAccount
              shopper={{ name: me.data?.name ?? user.name, imageUrl: me.data?.imageUrl }}
            />
          ) : (
            <GuestAccount />
          )}
        </ScrollView>
      )}
    </View>
  );
}
