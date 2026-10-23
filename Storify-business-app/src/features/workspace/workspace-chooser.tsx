import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { LogoTile } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/press-motion';
import { Text } from '@/components/ui/text';
import type { WorkspaceAccess } from '@/contracts/mobile/biz/v1';
import { useSignOut } from '@/features/auth/use-sign-out';

import { useWorkspaceLabel } from './workspace-label';

type WorkspaceChooserProps = {
  workspaces: WorkspaceAccess[];
  onChoose: (access: WorkspaceAccess) => void;
};

/**
 * "Where do you want to work?": one card per workspace. Tapping one opens it,
 * and the choice is remembered for this person on this phone.
 */
export function WorkspaceChooser({ workspaces, onChoose }: WorkspaceChooserProps) {
  const t = useTranslations('workspace');
  const label = useWorkspaceLabel();
  const { signOut, isPending } = useSignOut();

  return (
    <View className="gap-6">
      <View className="gap-2">
        <Text variant="display" accessibilityRole="header">
          {t('chooseTitle')}
        </Text>
        <Text className="text-muted">{t('chooseBody')}</Text>
      </View>

      <View className="gap-3">
        {workspaces.map((access) => {
          const named = label(access);
          return (
            <PressableScale
              key={access.workspace}
              accessibilityRole="button"
              accessibilityLabel={[named.name, named.role, named.scope].filter(Boolean).join(', ')}
              onPress={() => onChoose(access)}
              className="flex-row items-center gap-3 rounded-xl bg-surface p-4 active:opacity-90">
              <LogoTile logo={named.logo} icon={named.icon} size="lg" />
              <View className="flex-1 gap-0.5">
                <Text variant="label">{named.name}</Text>
                <Text variant="meta">{named.role}</Text>
                {named.scope ? <Text variant="caption">{named.scope}</Text> : null}
              </View>
              <Icon name="chevron-right" size={18} colorClassName="accent-muted" directional />
            </PressableScale>
          );
        })}
      </View>

      <Button
        label={t('signOut')}
        variant="ghost"
        destructive
        loading={isPending}
        onPress={() => void signOut()}
        className="self-center"
      />
    </View>
  );
}
