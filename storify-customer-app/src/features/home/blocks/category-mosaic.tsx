import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppImage } from '@/components/ui/app-image';
import { Text } from '@/components/ui/text';
import type { CategoryMosaicBlock, CategoryTile } from '@/contracts/mobile/shop/v1';
import { categoryHref, productsHref } from '@/features/categories/category-href';
import { findCategory, useCategories } from '@/features/categories/use-categories';

import { BlockTitle } from './block-title';

// The large tile and the four small ones beside it; the Categories tab has the rest.
const SMALL_TILES = 4;

function Tile({ category, onOpen }: { category: CategoryTile; onOpen: (slug: string) => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={category.name}
      onPress={() => onOpen(category.slug)}
      className="size-full overflow-hidden rounded-2xl bg-surface active:opacity-80">
      <AppImage image={category.image} size="card" className="absolute inset-0" decorative />
      <View className="absolute inset-x-0 bottom-0 bg-scrim/40 px-3 py-2">
        <Text variant="label" className="text-on-scrim" numberOfLines={2}>
          {category.name}
        </Text>
      </View>
    </Pressable>
  );
}

/** A bento of the store's categories: the first is the large tile, the rest share the grid beside it. */
export function CategoryMosaic({ block }: { block: CategoryMosaicBlock }) {
  const router = useRouter();
  const tree = useCategories().data ?? [];
  const [first, ...rest] = block.categories;
  if (!first) return null;

  // As the Categories tab opens it: its own page when it has sub-categories, else its products.
  const open = (slug: string) => {
    const category = findCategory(tree, slug);
    // Two pushes, not one of two Hrefs: a choice between Hrefs is a union
    // TypeScript gives up on.
    if (category) router.push(categoryHref(category));
    else router.push(productsHref({ slug }));
  };

  return (
    <View className="gap-4">
      {block.title ? <BlockTitle title={block.title} /> : null}
      <View className="h-80 flex-row gap-2 px-4">
        <View className="flex-1">
          <Tile category={first} onOpen={open} />
        </View>
        {rest.length > 0 ? (
          <View className="flex-1 flex-row flex-wrap gap-2">
            {rest.slice(0, SMALL_TILES).map((category) => (
              <View key={category.id} className="h-39 w-[calc(50%-4px)]">
                <Tile category={category} onOpen={open} />
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}
