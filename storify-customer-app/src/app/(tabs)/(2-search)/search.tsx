import { Stack } from 'expo-router';

import { SearchScreen } from '@/features/search/search-screen';

/** The Search tab. It draws its own header: the field in it drives the page under it. */
export default function SearchTab() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SearchScreen />
    </>
  );
}
