import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, HandoffState, SuccessState } from '@/components/ui/state-view';

import { GalleryItem, GalleryPage, GallerySection } from './gallery-kit';

const noop = () => {};

/** A state fills its screen; on the page it gets a phone's worth of height. */
const Screen = ({ children }: { children: ReactNode }) => (
  <View className="h-[560px] overflow-hidden rounded-lg">{children}</View>
);

/** The states of `src/components/ui/state-view`, each as it fills a screen. */
export function StatesGallery() {
  return (
    <GalleryPage>
      <GallerySection title="States">
        <GalleryItem label="Empty · icon, subheading, body, primary button">
          <Screen>
            <EmptyState
              title="Your cart is empty"
              body="Browse the store and add something you like."
              action={<Button label="Start shopping" onPress={noop} />}
            />
          </Screen>
        </GalleryItem>
        <GalleryItem label="Empty · title only">
          <Screen>
            <EmptyState title="No orders yet" icon="package" />
          </Screen>
        </GalleryItem>
        <GalleryItem label="Error · retry">
          <Screen>
            <ErrorState error={new Error('offline')} onRetry={noop} />
          </Screen>
        </GalleryItem>
        <GalleryItem label="Success · check in a disc, title, line, actions">
          <Screen>
            <SuccessState
              title="Payment Successful!"
              body="Your order is on its way. You can follow it from your orders."
              actions={
                <>
                  <Button label="View E-Receipt" variant="secondary" onPress={noop} />
                  <Button label="Continue Shopping" onPress={noop} />
                </>
              }
            />
          </Screen>
        </GalleryItem>
        <GalleryItem label="Hand-off · no buttons">
          <Screen>
            <HandoffState title="Signing you in…" body="alex@example.com" />
          </Screen>
        </GalleryItem>
      </GallerySection>
    </GalleryPage>
  );
}
