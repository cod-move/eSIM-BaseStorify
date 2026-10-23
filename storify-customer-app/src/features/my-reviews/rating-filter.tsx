import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Icon } from '@/components/ui/icon';
import { RadioRow } from '@/components/ui/rows';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';

const STARS = [5, 4, 3, 2, 1] as const;

type RatingFilterProps = {
  rating: number | undefined;
  onRating: (rating: number | undefined) => void;
};

/** "Rating: All", and the sheet that chooses which star rating to show. */
export function RatingFilter({ rating, onRating }: RatingFilterProps) {
  const t = useTranslations('reviews');
  const [open, setOpen] = useState(false);
  const choice = rating === undefined ? t('all') : t('stars', { stars: rating });
  const choose = (next: number | undefined) => {
    setOpen(false);
    onRating(next);
  };

  return (
    <View className="flex-row items-center gap-2">
      <Text variant="body" importantForAccessibility="no" accessibilityElementsHidden>
        {t('rating')}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('filterLabel', { choice })}
        onPress={() => setOpen(true)}
        className="min-h-11 flex-row items-center gap-2 rounded-md border border-border bg-background px-3 active:opacity-70">
        <Text variant="body">{choice}</Text>
        <Icon name="chevron-down" size={14} colorClassName="accent-foreground" />
      </Pressable>
      <Sheet visible={open} title={t('filterTitle')} onClose={() => setOpen(false)}>
        <RadioRow
          title={t('all')}
          selected={rating === undefined}
          onSelect={() => choose(undefined)}
        />
        {STARS.map((stars) => (
          <RadioRow
            key={stars}
            title={t('stars', { stars })}
            selected={rating === stars}
            onSelect={() => choose(stars)}
          />
        ))}
      </Sheet>
    </View>
  );
}
