import { useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { EdgeFade } from '@/components/ui/edge-fade';
import { categoryHref } from '@/features/categories/category-href';
import { useCategories } from '@/features/categories/use-categories';

/** The store's top-level departments as picture chips, each opening as the Categories tab opens it. */
export function CategoryChips() {
  const router = useRouter();
  const categories = useCategories().data ?? [];

  if (categories.length === 0) return null;

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 px-4">
        {categories.map((category, index) => (
          <Chip
            key={category.id}
            kind="picture"
            ink={index === 0}
            label={category.name}
            image={category.image}
            onPress={() => router.push(categoryHref(category))}
          />
        ))}
      </ScrollView>
      <EdgeFade />
    </View>
  );
}
