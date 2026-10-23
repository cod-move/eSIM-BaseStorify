import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { SheetPanel, SheetStage } from '@/components/ui/sheet';

type DetailSheetProps = {
  /** The product's slug: a sheet opened from a link closes onto the product's page. */
  slug: string;
  title: string;
  children: ReactNode;
};

/**
 * A detail sheet of the product page: a tall sheet
 * over the dimmed product page. Its route opens over the page, so closing it
 * leaves the shopper where they were; opened from a link, it closes onto the
 * product page.
 */
export function DetailSheet({ slug, title, children }: DetailSheetProps) {
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
        {children}
        <View style={{ height: tabBar }} />
      </SheetPanel>
    </SheetStage>
  );
}
