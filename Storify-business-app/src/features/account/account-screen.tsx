import { router } from 'expo-router';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { GroupFootnote, NavRow, RowGroup } from '@/components/ui/rows';
import { Screen, StackHeader } from '@/components/ui/screen';
import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { useOpenDashboard } from '@/features/web/use-open-page';
import { useMe } from '@/features/workspace/use-me';
import { useWorkspace } from '@/features/workspace/use-workspace';
import { useWorkspaceLabel } from '@/features/workspace/workspace-label';

import { ProfilePicture } from './profile-picture';
import { SignOutRow } from './sign-out-row';

/**
 * Account: who the operator is and how they sign in. On
 * the profile wash, their picture in a ring (a tap changes it) with their
 * name, email, role and workspace; then the Security card. The name and email
 * are the website's to change, so a card says so and opens it. Signing out ends the
 * page, as people look for it here too; the preferences and the version are
 * on the Account tab.
 */
export function AccountScreen() {
  const t = useTranslations('account');
  const common = useTranslations('common');
  const me = useMe();
  const openDashboard = useOpenDashboard();
  const state = useWorkspace();
  const label = useWorkspaceLabel();
  const header = <StackHeader title={t('title')} icon="user" />;

  if (!me.data) {
    return (
      <Screen header={header}>
        {me.isError ? (
          <ErrorState error={me.error} onRetry={() => void me.refetch()} />
        ) : (
          <LoadingState shape="spinner" />
        )}
      </Screen>
    );
  }

  const person = me.data;
  const workspace = state.status === 'ready' ? label(state.access) : null;

  return (
    <Screen header={header} wash="profile" scroll contentClassName="gap-4 px-4 pt-2">
      <View className="items-center gap-1 pb-2">
        <ProfilePicture name={person.name} imageUrl={person.imageUrl} />
        <Text variant="title-large" className="pt-2 text-center">
          {person.name}
        </Text>
        <Text variant="meta" className="text-center">
          {person.email}
        </Text>
        {workspace ? (
          <Text variant="meta" className="text-center">
            {[workspace.role, workspace.name].join(common('separator'))}
          </Text>
        ) : null}
      </View>

      <RowGroup title={t('security')}>
        <NavRow
          icon="lock"
          title={t('password.title')}
          description={t('password.description')}
          onPress={() => router.push('/more/account/password')}
        />
        <NavRow
          icon="shield"
          title={t('twoStep.title')}
          description={t('twoStep.description')}
          value={person.twoFactorEnabled ? t('twoStep.on') : t('twoStep.off')}
          onPress={() => router.push('/more/account/two-step')}
        />
      </RowGroup>

      {openDashboard ? (
        <View>
          <RowGroup>
            <NavRow icon="globe" title={common('openWebsite')} onPress={openDashboard} />
          </RowGroup>
          <GroupFootnote text={t('profileOnWebsite')} />
        </View>
      ) : null}

      <RowGroup>
        <SignOutRow />
      </RowGroup>
    </Screen>
  );
}
