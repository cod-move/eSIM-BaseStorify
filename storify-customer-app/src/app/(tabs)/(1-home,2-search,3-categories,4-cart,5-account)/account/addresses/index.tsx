import { Stack, useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { useBottomSpace } from '@/components/shell/tab-bar';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/features/auth/use-session';
import { AddressCard } from '@/features/addresses/address-card';
import { useAddresses, useChangeAddresses } from '@/features/addresses/use-addresses';

/** The address book: one card per address, the default first, and "Add new Address". */
export default function AddressesScreen() {
  const t = useTranslations('addresses');
  const router = useRouter();
  const { isSignedIn } = useSession();
  const book = useAddresses();
  const change = useChangeAddresses();
  const toast = useToast();
  const bottom = useBottomSpace();

  const header = <Stack.Screen options={{ title: t('title') }} />;
  const addNew = () => router.push('/account/addresses/new');

  if (!isSignedIn) {
    return (
      <>
        {header}
        <EmptyState
          icon="pin"
          title={t('guestTitle')}
          body={t('guestBody')}
          action={<Button label={t('signIn')} onPress={() => router.push('/login')} />}
        />
      </>
    );
  }
  if (book.isPending) return <LoadingState />;
  if (book.isError) return <ErrorState error={book.error} onRetry={() => void book.refetch()} />;

  const failed = () => toast.show({ message: t('failed') });
  const busyId = change.isPending && 'id' in change.variables ? change.variables.id : undefined;

  return (
    <View className="flex-1 bg-background">
      {header}
      {book.data.length === 0 ? (
        <EmptyState icon="pin" title={t('emptyTitle')} body={t('emptyBody')} />
      ) : (
        <ScrollView contentContainerClassName="gap-4 p-4">
          {book.data.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              busy={busyId === address.id}
              onEdit={() =>
                router.push({ pathname: '/account/addresses/[id]', params: { id: address.id } })
              }
              onRemove={() =>
                change.mutate(
                  { kind: 'remove', id: address.id },
                  { onSuccess: () => toast.show({ message: t('removed') }), onError: failed }
                )
              }
              onSetDefault={() =>
                change.mutate({ kind: 'default', id: address.id }, { onError: failed })
              }
            />
          ))}
        </ScrollView>
      )}
      <View className="px-4 pt-2" style={{ paddingBottom: 16 + bottom }}>
        <Button label={t('addNew')} variant="accent" icon="plus" onPress={addNew} />
      </View>
    </View>
  );
}
