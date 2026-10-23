import { useLocalSearchParams } from 'expo-router';

import { PictureViewerScreen } from '@/features/viewer/picture-viewer-screen';

/** `/viewer?url=…&title=…`: a picture full screen, over the screen it was opened from. */
export default function Viewer() {
  const { url, title } = useLocalSearchParams<{ url?: string; title?: string }>();
  return <PictureViewerScreen url={url} title={title} />;
}
