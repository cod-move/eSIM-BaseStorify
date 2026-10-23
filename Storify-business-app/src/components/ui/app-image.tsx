import { Image, type ImageContentFit } from 'expo-image';
import { Platform, View } from 'react-native';
import { withUniwind } from 'uniwind';

import type { ImageSet } from '@/contracts/mobile/biz/v1';
import { cn } from '@/lib/cn';

const TokenImage = withUniwind(Image);

// Without it the store's image service answers with JPEG or PNG, several times the size.
// Not on the web: there expo-image fetches a source that has headers, which a store
// without CORS headers refuses, and the browser asks for WebP on its own anyway.
const HEADERS = Platform.OS === 'web' ? undefined : { Accept: 'image/webp,image/*;q=0.8' };

type AppImageProps = {
  /** A picture from the API. While it is missing or loading, the token-coloured box shows. */
  image: ImageSet | undefined;
  /** `thumb` for a small square, `card` for a list or a rail, `full` for the product page. */
  size: 'thumb' | 'card' | 'full';
  /** The size and shape of the frame: `size-20 rounded-full`, `aspect-square w-full rounded-lg`. */
  className?: string;
  /** Width divided by height, when the API sends the shape of the frame with the picture. */
  aspectRatio?: number;
  /** `fill` stretches the picture to its frame: the store's banners are made for that. */
  contentFit?: ImageContentFit;
  /**
   * The picture adds nothing a screen reader should say, because what it sits
   * in (a product card, a category row) already carries the name.
   */
  decorative?: boolean;
  /** Softens the picture into a backdrop, in points. */
  blurRadius?: number;
  /** The picture has arrived: a screen that waits for it (the full-screen viewer) stops its spinner. */
  onLoad?: () => void;
  /** The picture could not be loaded: a screen that waits for it says so. */
  onError?: () => void;
};

/**
 * Every picture that comes from the store. It picks the rendition for the size
 * it is shown at, asks for WebP, caches on disk, and gives a recycled list row
 * its own picture instead of the previous row's.
 *
 * The frame is a view and the picture fills it, so the frame keeps its shape
 * and its placeholder colour before the picture has arrived.
 */
export function AppImage({
  image,
  size,
  className,
  aspectRatio,
  contentFit = 'cover',
  decorative = false,
  blurRadius,
  onLoad,
  onError,
}: AppImageProps) {
  const uri = image?.[size];

  return (
    <View
      className={cn('overflow-hidden bg-surface', className)}
      style={aspectRatio ? { aspectRatio } : undefined}>
      <TokenImage
        className="size-full"
        source={uri ? { uri, headers: HEADERS } : null}
        alt={decorative ? undefined : image?.alt}
        accessible={!decorative}
        contentFit={contentFit}
        blurRadius={blurRadius}
        recyclingKey={uri}
        transition={150}
        onLoad={onLoad}
        onError={onError}
      />
    </View>
  );
}
