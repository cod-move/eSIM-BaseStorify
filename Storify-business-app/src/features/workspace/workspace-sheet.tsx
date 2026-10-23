import { useTranslations } from 'use-intl';

import { LogoTile } from '@/components/ui/avatar';
import { PickerSheet } from '@/components/ui/sheet';
import type { Workspace } from '@/contracts/mobile/biz/v1';

import { useSwitchWorkspace } from './use-switch-workspace';
import { useWorkspace } from './use-workspace';
import { useWorkspaceLabel } from './workspace-label';

type WorkspaceSheetProps = {
  visible: boolean;
  onClose: () => void;
};

/** The workspaces as rows, the current one chosen; choosing another switches at once. */
export function WorkspaceSheet({ visible, onClose }: WorkspaceSheetProps) {
  const t = useTranslations('workspace');
  const state = useWorkspace();
  const label = useWorkspaceLabel();
  const switchTo = useSwitchWorkspace();
  if (state.status !== 'ready') return null;

  return (
    <PickerSheet<Workspace>
      visible={visible}
      title={t('switchTitle')}
      value={state.workspace}
      onChoose={switchTo}
      onClose={onClose}
      options={state.workspaces.map((access) => {
        const named = label(access);
        return {
          value: access.workspace,
          title: named.name,
          description: [named.role, named.scope].filter(Boolean).join(' · '),
          leading: <LogoTile logo={named.logo} icon={named.icon} size="md" />,
        };
      })}
    />
  );
}
