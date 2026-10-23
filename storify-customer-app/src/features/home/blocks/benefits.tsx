import { View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { BenefitsBlock } from '@/contracts/mobile/shop/v1';

/** An icon the app does not know (the store may add some) draws a plain check. */
const ICONS: Partial<Record<string, IconName>> = {
  TRUCK: 'truck',
  SHIELD: 'shield',
  RETURNS: 'return',
  SUPPORT: 'chat',
  WALLET: 'wallet',
  DISCOUNT: 'percent',
  GIFT: 'package',
};

/** The store's promises as rows: an icon, the promise, and its detail when there is one. */
export function Benefits({ block }: { block: BenefitsBlock }) {
  return (
    <View className="mx-4 gap-4 rounded-2xl bg-surface p-4">
      {block.items.map((item) => (
        <View key={item.id} className="flex-row items-center gap-3">
          <View className="size-11 items-center justify-center rounded-full bg-background">
            <Icon
              name={ICONS[item.icon] ?? 'check-circle'}
              size={22}
              colorClassName="accent-primary"
            />
          </View>
          <View className="flex-1">
            <Text variant="subheading">{item.title}</Text>
            {item.text ? <Text variant="caption">{item.text}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}
