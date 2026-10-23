import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ImageViewer } from '@/components/ui/image-viewer';
import { RichText } from '@/components/ui/rich-text';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import type { ImageSet } from '@/contracts/mobile/shop/v1';

import { GalleryItem, GalleryPage, GallerySection } from './gallery-kit';

/**
 * The merchant's HTML as the store sends it, the full-screen viewer and the
 * skeletons. The description is made up here the way a rich-text editor writes
 * one.
 */
const photo = (seed: string, alt: string): ImageSet => {
  const url = (width: number) => `https://picsum.photos/seed/${seed}/${width}/${width}`;
  return { thumb: url(256), card: url(640), full: url(1080), alt };
};

const DESCRIPTION = `
<img src="https://picsum.photos/seed/storify-phone/780/440" width="780" height="440" alt="The phone, front and back">
<p>The new flagship has a larger display, a faster chip and the longest battery life we have made. It is built from <strong>titanium</strong>, which is <em>strong and light</em>, and it keeps the camera system that photographers asked for.</p>
<p>Read the <a href="/pages/shipping">shipping policy</a>, or write to <a href="mailto:help@example.com">help@example.com</a>.</p>
<h2>iPhone 16 Pro Max Features</h2>
<ul>
  <li>6.9-inch Super Retina display with ProMotion</li>
  <li>A18 Pro chip with a 6-core GPU</li>
  <li><strong>Camera Control</strong> to take a picture, or to start a video</li>
  <li>Up to 33 hours of video playback</li>
</ul>
`;

const EVERYTHING = `
<h1>Heading 1</h1><h2>Heading 2</h2><h3>Heading 3</h3><h4>Heading 4</h4>
<p>A paragraph with <b>bold</b>, <i>italic</i>, <b><i>both</i></b>, a <a href="/products/red-shoe">link</a>
and a line<br>break.</p>
<ol><li>First</li><li>Second<ul><li>Nested bullet</li><li>Another</li></ul></li><li>Third</li></ol>
<p>A picture without a width or a height takes a default shape:</p>
<img src="https://picsum.photos/seed/storify-bare/600/600" alt="A square picture">
<div>A <span>div</span> and a span are unwrapped, their text stays.</div>
`;

/** What a hostile or careless HTML holds. None of it may reach the screen. */
const HOSTILE = `
<p>This paragraph is the only text that should show.</p>
<script>alert('script')</script>
<style>p { color: red }</style>
<iframe src="https://example.com"><p>text in a frame</p></iframe>
<svg onload="alert(1)"><text>text in a drawing</text></svg>
<form action="https://example.com"><input name="card"><button>Pay now</button></form>
<img src="x" onerror="alert(1)">
<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+">
<p><a href="javascript:alert(1)">A javascript link is plain text.</a></p>
`;

const VIEWER_IMAGES = [
  photo('storify-view-a', 'First picture'),
  photo('storify-view-b', 'Second picture'),
  photo('storify-view-c', 'Third picture'),
];

export function RichTextGallery() {
  const [pressed, setPressed] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  return (
    <GalleryPage>
      <GallerySection title="Product description">
        <GalleryItem label="Description sheet: the name, then the merchant's HTML">
          <View className="gap-3">
            <Text variant="display">iPhone 16 Pro Max</Text>
            <RichText html={DESCRIPTION} onLinkPress={setPressed} />
          </View>
        </GalleryItem>
        <GalleryItem label="The last link pressed">
          <Text variant="caption">{pressed ?? 'none yet'}</Text>
        </GalleryItem>
      </GallerySection>

      <GallerySection title="Every element of the subset">
        <RichText html={EVERYTHING} onLinkPress={setPressed} />
      </GallerySection>

      <GallerySection title="Hostile HTML">
        <GalleryItem label="Only the first paragraph shows; the javascript link is plain text">
          <RichText html={HOSTILE} onLinkPress={setPressed} />
        </GalleryItem>
      </GallerySection>

      <GallerySection title="Image viewer">
        <GalleryItem label="Black in both themes, swipe between pictures, pinch on iOS">
          <Button label="Open the viewer" onPress={() => setViewerOpen(true)} />
        </GalleryItem>
        <ImageViewer
          images={VIEWER_IMAGES}
          visible={viewerOpen}
          onClose={() => setViewerOpen(false)}
          closeLabel="Close"
          positionLabel={(current, total) => `Image ${current} of ${total}`}
        />
      </GallerySection>

      <GallerySection title="Skeletons">
        <GalleryItem label="Block, circle and text lines">
          <View className="gap-3 rounded-xl bg-surface p-4">
            <View className="flex-row items-center gap-3">
              <Skeleton className="size-12 rounded-full" />
              <View className="flex-1 gap-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </View>
            </View>
            <Skeleton className="aspect-video w-full rounded-lg" />
            <SkeletonText lines={3} />
          </View>
        </GalleryItem>
      </GallerySection>
    </GalleryPage>
  );
}
