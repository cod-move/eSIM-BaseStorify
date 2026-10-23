import { Link, type Href } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { useBottomSpace } from '@/components/shell/tab-bar';
import { AppImage } from '@/components/ui/app-image';
import { Text } from '@/components/ui/text';
import type { Category, ImageSet } from '@/contracts/mobile/shop/v1';

import { categoryHref, productsHref } from './category-href';

/**
 * A category with sub-categories: its picture and name, then a row for the
 * whole category ("All Laptop") and one for each sub-category.
 */
export function CategoryDetail({ category }: { category: Category }) {
  const t = useTranslations('categories');
  const bottom = useBottomSpace();

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="px-4 pt-4"
      contentContainerStyle={{ paddingBottom: bottom + 48 }}>
      <AppImage
        image={category.image}
        size="card"
        contentFit="contain"
        className="h-[130px] w-full bg-transparent"
        decorative
      />
      <Text variant="display" accessibilityRole="header" className="mt-3 mb-7 text-center">
        {category.name}
      </Text>
      <View className="gap-[10px]">
        <CategoryRow
          name={t('all', { name: category.name })}
          image={category.image}
          href={productsHref(category)}
        />
        {category.children.map((child) => (
          <CategoryRow
            key={child.id}
            name={child.name}
            image={child.image}
            href={categoryHref(child)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

type CategoryRowProps = {
  name: string;
  image: ImageSet | undefined;
  href: Href;
};

function CategoryRow({ name, image, href }: CategoryRowProps) {
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={name}
        className="min-h-[90px] flex-row items-center gap-8 rounded-xl bg-surface px-4 py-3 active:opacity-80">
        <AppImage
          image={image}
          size="thumb"
          contentFit="contain"
          className="h-16 w-[84px] rounded-md bg-transparent"
          decorative
        />
        <Text variant="subheading" numberOfLines={2} className="flex-1">
          {name}
        </Text>
      </Pressable>
    </Link>
  );
}
