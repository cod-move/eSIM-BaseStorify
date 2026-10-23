import { View } from 'react-native';

import { isApiError } from '@/api/errors';
import { RowGroup, SwitchRow } from '@/components/ui/rows';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import type { PreferenceGroup } from '@/contracts/mobile/shop/v1';
import { PushStatusRow } from '@/features/account/push-status-row';
import { useErrorMessage } from '@/i18n/use-error-message';

import { useTogglePreference } from './use-preferences';

/**
 * One card of switches per group, in the store's order, with its titles and
 * descriptions. Under the push topics, what the phone itself allows.
 */
export function PreferenceGroups({ groups }: { groups: PreferenceGroup[] }) {
  const toast = useToast();
  const describe = useErrorMessage();
  const { toggle } = useTogglePreference((error) => {
    const sent = isApiError(error) ? error.errors?.preferences?.[0] : undefined;
    toast.show({ message: sent ?? describe(error) });
  });

  return groups.map((group) => (
    <View key={group.key} className="gap-6">
      <View className="gap-2">
        <Text variant="subheading">{group.title}</Text>
        <RowGroup accessibilityLabel={group.title}>
          {group.items.map((item) => (
            <SwitchRow
              key={item.key}
              title={item.title}
              description={item.description}
              value={item.enabled}
              onValueChange={(enabled) => toggle({ key: item.key, enabled })}
            />
          ))}
        </RowGroup>
      </View>
      {group.key === 'PUSH' ? <PushStatusRow /> : null}
    </View>
  ));
}
