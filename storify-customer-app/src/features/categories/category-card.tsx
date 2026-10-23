import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppImage } from '@/components/ui/app-image';
import { Text } from '@/components/ui/text';
import type { Category } from '@/contracts/mobile/shop/v1';

import { categoryHref } from './category-href';

/** A category on the Categories tab: its name at the start, its picture below. */
export function CategoryCard({ category }: { category: Category }) {
  return (
    <Link href={categoryHref(category)} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={category.name}
        className="aspect-square flex-1 rounded-xl bg-surface p-4 active:opacity-80">
        <Text numberOfLines={1}>{category.name}</Text>
        {/* The picture at three quarters of the space under the name, centred. */}
        <View className="mt-2 flex-1 items-center justify-center">
          <AppImage
            image={category.image}
            size="card"
            contentFit="contain"
            className="h-3/4 w-3/4 bg-transparent"
            decorative
          />
        </View>
      </Pressable>
    </Link>
  );
}

/** Keeps an odd last row's single card at the width of the others. */
export function CategoryCardSpace() {
  return <View className="flex-1" />;
}
