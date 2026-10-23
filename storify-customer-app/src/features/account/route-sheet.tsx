import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';

import { SheetPanel, SheetStage } from '@/components/ui/sheet';

type RouteSheetProps = {
  title: string;
  footer?: ReactNode;
  children: ReactNode;
};

/**
 * A sheet that is a screen of its own (Change Password, Delete Account): its
 * route opens over the Security screen, which shows dimmed behind it, and
 * closing it goes back there.
 */
export function RouteSheet({ title, footer, children }: RouteSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  // The sheet slides out first, then the route closes under it.
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/account/security'));
  const close = () => setOpen(false);

  return (
    <SheetStage open={open} onDismiss={close} onClosed={leave}>
      <SheetPanel title={title} onClose={close} footer={footer}>
        {children}
      </SheetPanel>
    </SheetStage>
  );
}
