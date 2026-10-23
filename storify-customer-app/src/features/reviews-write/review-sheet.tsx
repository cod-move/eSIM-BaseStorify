import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { SheetPanel, SheetStage } from '@/components/ui/sheet';

type ReviewSheetProps = {
  /** The product's slug: opened from a link, the sheet closes onto the product's page. */
  slug: string;
  title: string;
  /** Handed the way to close the sheet: the Done of a review that was sent. */
  children: (close: () => void) => ReactNode;
};

/** The tall sheet a review is written in, over the dimmed product page. */
export function ReviewSheet({ slug, title, children }: ReviewSheetProps) {
  const router = useRouter();
  const tabBar = useTabBarHeight();
  const [open, setOpen] = useState(true);
  // The sheet slides out first, then the route closes under it.
  const close = () => setOpen(false);
  const leave = () =>
    router.canGoBack()
      ? router.back()
      : router.replace({ pathname: '/products/[slug]', params: { slug } });

  return (
    <SheetStage open={open} onDismiss={close} onClosed={leave}>
      <SheetPanel title={title} onClose={close} size="tall">
        {children(close)}
        <View style={{ height: tabBar }} />
      </SheetPanel>
    </SheetStage>
  );
}
