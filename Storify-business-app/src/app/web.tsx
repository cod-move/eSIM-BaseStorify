import { useLocalSearchParams } from 'expo-router';

import { WebPageScreen } from '@/features/web/web-page-screen';

/** `/web?url=…&title=…`: a web page inside the app. */
export default function Web() {
  const { url, title } = useLocalSearchParams<{ url?: string; title?: string }>();
  return <WebPageScreen url={url} title={title} />;
}
