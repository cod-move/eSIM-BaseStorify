import { useRef, useState } from 'react';
import { useTranslations } from 'use-intl';

import { ActionRow } from '@/components/ui/rows';
import { ConfirmSheet } from '@/components/ui/sheet';
import { useSignOut } from '@/features/auth/use-sign-out';

/**
 * "Sign out", in `danger`, after a confirm sheet: on a work phone a stray tap
 * would cost the next sign-in. The sheet slides away first, and the sign-out
 * starts once it has left the screen: signing out takes this screen away, and
 * a sheet still on show must not go with it. The layout leaves for the sign-in
 * screen by itself once the session is gone.
 */
export function SignOutRow() {
  const t = useTranslations('account.signOut');
  const { signOut, isPending } = useSignOut();
  const [asking, setAsking] = useState(false);
  const confirmed = useRef(false);

  return (
    <>
      <ActionRow
        icon="sign-out"
        title={t('row')}
        destructive
        disabled={isPending}
        onPress={() => setAsking(true)}
      />
      <ConfirmSheet
        visible={asking}
        title={t('title')}
        body={t('body')}
        confirmLabel={t('confirm')}
        tone="danger"
        cancelLabel={t('cancel')}
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          confirmed.current = true;
          setAsking(false);
        }}
        onClosed={() => {
          if (!confirmed.current) return;
          confirmed.current = false;
          void signOut();
        }}
      />
    </>
  );
}
