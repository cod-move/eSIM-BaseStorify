import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Divider } from '@/components/ui/divider';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { FaqPage } from '@/contracts/mobile/shop/v1';

import { ArticleScroll, ArticleTitle } from './article-parts';

type FaqViewProps = {
  faq: FaqPage;
  refreshing: boolean;
  onRefresh: () => void;
};

/** The store's questions, one open at a time, as the Help screen shows its own. */
export function FaqView({ faq, refreshing, onRefresh }: FaqViewProps) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <ArticleScroll refreshing={refreshing} onRefresh={onRefresh}>
      <ArticleTitle title={faq.title} />
      {faq.subtitle ? (
        <Text variant="body" className="-mt-3 text-muted">
          {faq.subtitle}
        </Text>
      ) : null}
      <View className="overflow-hidden rounded-2xl bg-surface">
        {faq.items.map((item, index) => {
          const expanded = open === item.id;
          return (
            <View key={item.id}>
              {index > 0 ? <Divider /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => setOpen(expanded ? null : item.id)}
                className="min-h-12 flex-row items-center gap-3 px-4 py-3 active:opacity-80">
                <Text variant="subheading" className="flex-1">
                  {item.question}
                </Text>
                <View className={expanded ? 'rotate-180' : undefined}>
                  <Icon name="chevron-down" size={20} colorClassName="accent-muted" />
                </View>
              </Pressable>
              {expanded ? (
                <Text variant="long" className="px-4 pb-4 text-muted">
                  {item.answer}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    </ArticleScroll>
  );
}
