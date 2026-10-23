import { ScrollView, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { EdgeFade } from '@/components/ui/edge-fade';
import { Icon } from '@/components/ui/icon';
import { starFills } from '@/components/ui/rating';
import { Text } from '@/components/ui/text';
import type { TestimonialsBlock } from '@/contracts/mobile/shop/v1';

import { BlockTitle } from './block-title';

/** What customers wrote in their reviews, as quote cards in a row that scrolls. */
export function Testimonials({ block }: { block: TestimonialsBlock }) {
  const t = useTranslations('home.blocks.testimonials');
  const format = useFormatter();
  if (block.testimonials.length === 0) return null;

  return (
    <View className="gap-3">
      {block.title ? <BlockTitle title={block.title} /> : null}
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-3 px-4">
          {block.testimonials.map((item) => (
            <View
              key={item.id}
              className="w-70 gap-2 rounded-2xl border border-border bg-surface p-4">
              <View
                accessible
                accessibilityLabel={t('ratingLabel', {
                  rating: format.number(item.rating, { maximumFractionDigits: 1 }),
                })}
                className="flex-row gap-0.5">
                {starFills(item.rating).map((fill, index) => (
                  <Icon
                    key={index}
                    name="star"
                    size={16}
                    colorClassName={fill >= 0.5 ? 'accent-rating' : 'accent-border'}
                    filled
                  />
                ))}
              </View>
              {item.title ? <Text variant="product">{item.title}</Text> : null}
              <Text numberOfLines={6}>{item.comment}</Text>
              {item.reviewerName ? (
                <Text variant="label" className="text-muted">
                  {item.reviewerName}
                </Text>
              ) : null}
            </View>
          ))}
        </ScrollView>
        <EdgeFade />
      </View>
    </View>
  );
}
