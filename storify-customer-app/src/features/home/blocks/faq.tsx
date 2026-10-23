import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Divider } from '@/components/ui/divider';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { FaqBlock } from '@/contracts/mobile/shop/v1';

import { BlockTitle } from './block-title';

/** Questions as rows; a tap opens the answer under its question, and a second tap closes it. */
export function Faq({ block }: { block: FaqBlock }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <View className="gap-3">
      {block.title ? <BlockTitle title={block.title} /> : null}
      <View className="mx-4 overflow-hidden rounded-2xl bg-surface">
        {block.items.map((item, index) => {
          const open = item.id === openId;

          return (
            <View key={item.id}>
              {index > 0 ? <Divider /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={item.question}
                accessibilityState={{ expanded: open }}
                onPress={() => setOpenId(open ? null : item.id)}
                className="min-h-11 flex-row items-center justify-between gap-3 px-4 py-3 active:opacity-80">
                <Text variant="subheading" className="flex-1">
                  {item.question}
                </Text>
                <View className={open ? 'rotate-180' : undefined}>
                  <Icon name="chevron-down" size={20} colorClassName="accent-muted" />
                </View>
              </Pressable>
              {open ? (
                <Text variant="long" className="px-4 pb-4">
                  {item.answer}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}
