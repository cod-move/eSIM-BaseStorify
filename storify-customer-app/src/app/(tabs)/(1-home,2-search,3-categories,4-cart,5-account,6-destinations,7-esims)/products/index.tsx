import { Stack, useLocalSearchParams } from 'expo-router';

import { Listing } from '@/features/browse/listing';
import { useListingTitle } from '@/features/browse/use-browse';
import { listingQueryFromWords } from '@/lib/listing-query';

/**
 * A list of products. What it lists comes from the address, in the website's
 * words or the app's: `/products?category=bags`, `/products?search=lamp`,
 * `/products?brand=acme&sortBy=price-asc`. `sheet=filter|sort` opens that sheet.
 */
export default function ProductsScreen() {
  const params = useLocalSearchParams();
  const query = listingQueryFromWords(params);
  const title = useListingTitle(query);
  const sheet = params.sheet === 'filter' || params.sheet === 'sort' ? params.sheet : undefined;

  return (
    <>
      <Stack.Screen options={{ title }} />
      <Listing key={JSON.stringify(query.q ?? '')} query={query} sheet={sheet} />
    </>
  );
}
