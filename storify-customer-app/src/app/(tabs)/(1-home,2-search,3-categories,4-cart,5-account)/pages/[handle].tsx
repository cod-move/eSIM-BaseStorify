import { useLocalSearchParams } from 'expo-router';

import { ContentPageScreen } from '@/features/content/content-page';

/** `/pages/{handle}`: a page the merchant wrote, as on the website. */
export default function StorePageScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  return <ContentPageScreen handle={handle} path={`/pages/${encodeURIComponent(handle)}`} />;
}
