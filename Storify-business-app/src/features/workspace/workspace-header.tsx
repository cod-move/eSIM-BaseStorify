import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { LogoTile } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';

import { useWorkspace } from './use-workspace';
import { useWorkspaceLabel } from './workspace-label';
import { WorkspaceSheet } from './workspace-sheet';

/**
 * Where the operator works, at the top of Home: the logo, the name and their
 * role. With two workspaces it is a button with a chevron that opens the
 * workspace sheet. `onBrand`: drawn on the store's `primary` (Home's
 * header), in its foreground.
 */
export function WorkspaceHeader({ onBrand = false }: { onBrand?: boolean }) {
  const t = useTranslations('workspace');
  const state = useWorkspace();
  const label = useWorkspaceLabel();
  const [open, setOpen] = useState(false);
  if (state.status !== 'ready') return null;

  const named = label(state.access);
  const canSwitch = state.workspaces.length > 1;
  const body = (
    <>
      <LogoTile logo={named.logo} icon={named.icon} size="md" />
      <View className="shrink gap-0.5">
        <View className="flex-row items-center gap-1">
          <Text
            variant="title"
            numberOfLines={1}
            className={cn('shrink', onBrand && 'text-primary-foreground')}>
            {named.name}
          </Text>
          {canSwitch ? (
            <Icon
              name="chevrons-up-down"
              size={16}
              colorClassName={onBrand ? 'accent-primary-foreground' : 'accent-muted'}
            />
          ) : null}
        </View>
        <Text
          variant="meta"
          numberOfLines={1}
          className={cn(onBrand && 'text-primary-foreground/75')}>
          {named.role}
        </Text>
      </View>
    </>
  );

  if (!canSwitch) {
    return (
      <View accessibilityRole="header" className="shrink flex-row items-center gap-3">
        {body}
      </View>
    );
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('currentLabel', { name: named.name, role: named.role })}
        accessibilityHint={t('switchHint')}
        onPress={() => setOpen(true)}
        className="shrink flex-row items-center gap-3 self-start active:opacity-70">
        {body}
      </Pressable>
      <WorkspaceSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
