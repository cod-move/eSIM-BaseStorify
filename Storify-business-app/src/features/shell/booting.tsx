import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { useSignOut } from '@/features/auth/use-sign-out';
import { useMe } from '@/features/workspace/use-me';

/**
 * Signed in, and GET /me not known yet: the first start after signing in (on
 * later starts it is on the device at once). If it cannot be read, the
 * operator can try again or sign out.
 */
export function Booting() {
  const t = useTranslations('shell');
  const me = useMe();
  const { signOut, isPending } = useSignOut();

  return (
    <View className="flex-1 bg-background pt-safe">
      {me.isError ? (
        <ErrorState
          error={me.error}
          onRetry={() => void me.refetch()}
          secondary={
            <Button
              label={t('signOut')}
              variant="ghost"
              destructive
              loading={isPending}
              onPress={() => void signOut()}
            />
          }
        />
      ) : (
        <LoadingState shape="spinner" />
      )}
    </View>
  );
}
