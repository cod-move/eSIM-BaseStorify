import { useTranslations } from 'use-intl';

import { useSignOut } from '@/features/auth/use-sign-out';
import { GateScreen } from '@/features/config/gate-screen';

/** Signed in, and GET /me lists no workspace: the operator's access was switched off. */
export default function NoAccess() {
  const t = useTranslations('workspace.noAccess');
  const { signOut } = useSignOut();

  return (
    <GateScreen
      icon="lock"
      tone="warning"
      title={t('title')}
      body={t('body')}
      secondary={{ label: t('signOut'), destructive: true, onPress: () => void signOut() }}
    />
  );
}
