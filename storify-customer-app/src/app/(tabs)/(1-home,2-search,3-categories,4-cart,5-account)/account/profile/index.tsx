import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBottomSpace } from '@/components/shell/tab-bar';
import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { Wash } from '@/features/account/account-parts';
import { ProfileForm } from '@/features/account/profile-form';
import { useMe } from '@/features/account/use-me';

/**
 * A signed-in screen. The root layout lets nobody in without a session, and the
 * request behind `useMe` is `auth: 'user'`, so the store checks it too.
 */
export default function ProfileScreen() {
  const me = useMe();
  const insets = useSafeAreaInsets();
  const bottom = useBottomSpace();

  if (me.isPending) return <LoadingState />;
  if (me.isError) return <ErrorState error={me.error} onRetry={() => void me.refetch()} />;

  return (
    <View className="flex-1 bg-background">
      <Wash name="profile" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="grow justify-end"
        contentContainerStyle={{ paddingTop: insets.top + 64 }}>
        <ProfileForm key={me.data.id} me={me.data} />
        <View className="bg-background" style={{ height: bottom }} />
      </ScrollView>
    </View>
  );
}
