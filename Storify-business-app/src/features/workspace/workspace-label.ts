import { useCallback } from 'react';
import { useTranslations } from 'use-intl';

import type { IconName } from '@/components/ui/icon';
import type { ImageSet, WorkspaceAccess } from '@/contracts/mobile/biz/v1';
import { useConfig } from '@/features/config/use-config';
import { storeWord } from '@/features/status/status-tone';

/** How a workspace is named on screen: the store's or the seller's name, logo and the operator's part in it. */
export type WorkspaceLabel = {
  name: string;
  logo: ImageSet | undefined;
  icon: IconName;
  /** "Administrator", "Staff", "Seller": the role in the store's word, translated when the app knows it. */
  role: string;
  /** "Limited to some sellers or locations", for a scoped operator. */
  scope: string | null;
};

const ROLES = new Set(['admin', 'staff', 'vendor']);

/**
 * Names a workspace: `platform` is the store itself (its name and square icon,
 * else its logo, from GET /config), `vendor` is the seller's shop (from GET /me).
 */
export function useWorkspaceLabel(): (access: WorkspaceAccess) => WorkspaceLabel {
  const t = useTranslations('workspace');
  const config = useConfig();
  const store = config.data?.store;

  return useCallback(
    (access) => {
      const vendor = access.workspace === 'vendor' ? access.vendor : undefined;
      const role = ROLES.has(access.role)
        ? t(`role.${access.role as 'admin' | 'staff' | 'vendor'}`)
        : storeWord(access.role);
      return {
        name:
          vendor?.name ?? (access.workspace === 'vendor' ? t('sellerShop') : (store?.name ?? '')),
        // A small square tile: the store's square mark where it set one, as
        // its wide logo shrinks to an unreadable strip there.
        logo: vendor ? vendor.logo : (store?.icon ?? store?.logo),
        icon: 'store',
        role,
        scope: access.scoped ? t('scoped') : null,
      };
    },
    [t, store]
  );
}
