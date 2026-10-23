import { FlatList, View, type RefreshControlProps } from 'react-native';
import type { ReactElement } from 'react';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import type { Category } from '@/contracts/mobile/shop/v1';

import { CategoryCard, CategoryCardSpace } from './category-card';

const COLUMNS = 2;

type CategoryGridProps = {
  categories: Category[];
  refreshControl: ReactElement<RefreshControlProps>;
};

/**
 * The top-level categories, two to a row. The rows scroll clear of the tab bar,
 * which floats over the bottom of the screen.
 */
export function CategoryGrid({ categories, refreshControl }: CategoryGridProps) {
  const tabBarHeight = useTabBarHeight();

  return (
    <FlatList
      className="flex-1 bg-background"
      data={rowsOf(categories)}
      keyExtractor={(row) => row.map((category) => category.id).join('|')}
      renderItem={({ item: row }) => (
        <View className="flex-row gap-3">
          {row.map((category) => (
            <CategoryCard key={category.id} category={category} />
          ))}
          {row.length < COLUMNS ? <CategoryCardSpace /> : null}
        </View>
      )}
      ItemSeparatorComponent={RowGap}
      contentContainerClassName="px-4 pt-4"
      contentContainerStyle={{ paddingBottom: tabBarHeight + 16 }}
      refreshControl={refreshControl}
    />
  );
}

function RowGap() {
  return <View className="h-3" />;
}

function rowsOf(categories: Category[]): Category[][] {
  const rows: Category[][] = [];
  for (let start = 0; start < categories.length; start += COLUMNS) {
    rows.push(categories.slice(start, start + COLUMNS));
  }
  return rows;
}
