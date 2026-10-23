import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { cn } from '@/lib/cn';

import { TextLink } from './button';
import { Text } from './text';

type SectionHeaderProps = {
  title: string;
  /** Shows "View All" at the end of the row; it opens the whole list. */
  onViewAll?: () => void;
  /**
   * The colour of "View All": `link` by default; `foreground` over a wash,
   * where the `link` colour does not keep 4.5:1.
   */
  linkTone?: 'link' | 'foreground';
  className?: string;
};

/** The title of a section of a screen, with "View All" at the other end. */
export function SectionHeader({
  title,
  onViewAll,
  linkTone = 'link',
  className,
}: SectionHeaderProps) {
  const t = useTranslations();

  return (
    <View className={cn('flex-row items-center justify-between gap-4', className)}>
      <Text variant="heading" accessibilityRole="header" className="shrink">
        {title}
      </Text>
      {onViewAll ? (
        // Several sections each have a "View All": the spoken label says which one.
        <TextLink
          label={t('common.viewAll')}
          accessibilityLabel={t('catalog.viewAllOf', { title })}
          onPress={onViewAll}
          tone={linkTone}
        />
      ) : null}
    </View>
  );
}
