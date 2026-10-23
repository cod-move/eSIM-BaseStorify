import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppImage } from '@/components/ui/app-image';
import { Text } from '@/components/ui/text';
import type { CategoryListBlock } from '@/contracts/mobile/shop/v1';
import { categoryHref, productsHref } from '@/features/categories/category-href';
import { findCategory, useCategories } from '@/features/categories/use-categories';

import { BlockTitle } from './block-title';

// Four a row, two rows; the Categories tab has the rest.
const SHOWN = 8;

/** The store's categories as a grid of icons, whatever layout the store chose for its website. */
export function CategoryList({ block }: { block: CategoryListBlock }) {
  const router = useRouter();
  const tree = useCategories().data ?? [];
  // In the app, as the Categories tab opens it: its own page when it has sub-categories, else its
  // products. The block's tile does not say which, so the store's tree does.
  const open = (slug: string) => {
    const category = findCategory(tree, slug);
    // Two pushes, not one of two Hrefs: a choice between Hrefs is a union
    // TypeScript gives up on.
    if (category) router.push(categoryHref(category));
    else router.push(productsHref({ slug }));
  };

  return (
    <View className="gap-6">
      {block.title ? <BlockTitle title={block.title} /> : null}
      <View className="flex-row flex-wrap gap-y-6 px-3">
        {block.categories.slice(0, SHOWN).map((category) => (
          <Pressable
            key={category.id}
            accessibilityRole="link"
            accessibilityLabel={category.name}
            onPress={() => open(category.slug)}
            className="w-1/4 items-center gap-2 px-1 active:opacity-70">
            <AppImage
              image={category.image}
              size="thumb"
              contentFit="contain"
              className="size-14 rounded-xl bg-background"
              decorative
            />
            {/* Two lines at most, broken evenly, so a name never leaves one word alone on its second line. */}
            <Text
              variant="chip"
              className="text-balance text-center"
              numberOfLines={2}
              textBreakStrategy="balanced"
              lineBreakStrategyIOS="push-out">
              {category.name}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
