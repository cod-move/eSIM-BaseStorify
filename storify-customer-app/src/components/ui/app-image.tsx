import { Image, type ImageContentFit } from 'expo-image';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { withUniwind } from 'uniwind';

import type { ImageSet } from '@/contracts/mobile/shop/v1';
import { cn } from '@/lib/cn';

const TokenImage = withUniwind(Image);

// Without it the store's image service answers with JPEG or PNG, several times the size.
// Not on the web: there expo-image fetches a source that has headers, which a store
// without CORS headers refuses, and the browser asks for WebP on its own anyway.
const WEBP_HEADERS = { Accept: 'image/webp,image/*;q=0.8' };

// A frame whose size is set from outside (`size-14`, or pinned to its parent's
// edges with `inset-0`) keeps it, whatever shape the picture is.
const FIXED_FRAME = /(^|\s)(size-|inset-0(\s|$))/;
const ROUND_FRAME = /(^|\s)rounded-full(\s|$)/;

type AppImageProps = {
  /**
   * A picture from the API, or a plain URL (the shopper's own picture, while
   * signing in). While it is missing or loading, the token-coloured box shows.
   */
  image: ImageSet | string | undefined;
  /**
   * `thumb` for a small square, `card` for a list or a rail, `full` for the
   * product page. A plain URL has one rendition, so the size does not matter to it.
   */
  size: 'thumb' | 'card' | 'full';
  /** The size and shape of the frame: `size-20 rounded-full`, `aspect-square w-full rounded-lg`. */
  className?: string;
  /**
   * Width divided by height, when the API sends the shape of the frame with the
   * picture. Without it the frame takes the picture's own ratio once it has
   * loaded (a frame given both a width and a height keeps those).
   */
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
}: AppImageProps) {
  const uri = typeof image === 'string' ? image : image?.[size];
  const alt = typeof image === 'string' ? undefined : image?.alt;
  const [own, setOwn] = useState<{ uri: string; ratio: number } | null>(null);
  // A fixed frame is not reshaped by the picture: an aspect ratio on top of a
  // width and a height stretches a square into an oval, and shrinks a picture
  // pinned to a slide's edges to a strip at its top.
  const ratio =
    aspectRatio ??
    (own && own.uri === uri && !FIXED_FRAME.test(className ?? '') ? own.ratio : undefined);

  return (
    <View
      className={cn('overflow-hidden bg-surface', className)}
      style={ratio ? { aspectRatio: ratio } : undefined}>
      <TokenImage
        // The frame clips, but where it is round the picture is rounded too, so no
        // platform shows a corner of it outside the circle.
        className={cn('size-full', ROUND_FRAME.test(className ?? '') && 'rounded-full')}
        source={uri ? { uri, headers: Platform.OS === 'web' ? undefined : WEBP_HEADERS } : null}
        alt={decorative ? undefined : alt}
        accessible={!decorative}
        contentFit={contentFit}
        blurRadius={blurRadius}
        recyclingKey={uri}
        onLoad={
          uri && aspectRatio === undefined
            ? ({ source }) => {
                if (source.width > 0 && source.height > 0) {
                  setOwn({ uri, ratio: source.width / source.height });
                }
              }
            : undefined
        }
        transition={150}
      />
    </View>
  );
}

type AppAssetProps = {
  /** A picture that ships with the app: `require('…/assets/images/….png')`. */
  source: number;
  /** The size of the picture: `size-28`, `h-11 w-36`. */
  className?: string;
  contentFit?: ImageContentFit;
};

/**
 * A picture that ships with the app rather than one from the store: the launch
 * screen's mark. It says nothing to a screen reader; the screen that shows it
 * names itself.
 */
export function AppAsset({ source, className, contentFit = 'contain' }: AppAssetProps) {
  return (
    <TokenImage
      className={className}
      source={source}
      contentFit={contentFit}
      accessible={false}
      transition={0}
    />
  );
}
