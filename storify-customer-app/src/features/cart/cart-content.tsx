import { useLocalSearchParams, useRouter, useScrollToTop } from 'expo-router';
import { useRef } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { Reveal, useReveal } from '@/components/ui/motion';
import type { Cart } from '@/contracts/mobile/shop/v1';
import { useConfig } from '@/features/config/use-config';

import { groupCartLines } from './cart-groups';
import { CartLineRow } from './cart-line-row';
import { CartSummary } from './cart-summary';
import { RemoveLineSheet } from './remove-line-sheet';
import { VendorTile } from './vendor-tile';

type CartContentProps = {
  cart: Cart;
  refreshing: boolean;
  onRefresh: () => void;
};

/**
 * A cart with lines: a card per seller under the seller's tile (a single
 * card in a single shop), "Add More Items", and the pinned summary. The line
 * being removed is named in the address (`?remove=<key>`), so the confirming
 * sheet survives a reload on the web and closes with the back button.
 *
 * "Complement Your Cart" is left out: the store sends no such rail.
 */
export function CartContent({ cart, refreshing, onRefresh }: CartContentProps) {
  const t = useTranslations('cart');
  const router = useRouter();
  const config = useConfig().data;
  const { remove } = useLocalSearchParams<{ remove?: string }>();
  const removing = cart.lines.find((line) => line.key === remove);
  const reveal = useReveal();
  const groups = groupCartLines(cart.lines, config?.features.multiVendor ?? false);
  // A tap on the lit Cart tab, while this page is open, brings it back to the top.
  const scroll = useRef<ScrollView>(null);
  useScrollToTop(scroll);

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        ref={scroll}
        className="flex-1"
        contentContainerClassName="gap-4 px-4 pb-6 pt-3"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {/* A seller's tile and card, then each line, rise into place; a removed
            line fades out and the card closes the gap. */}
        {groups.map((group, groupIndex) => (
          <Reveal key={group.key} leaves className="gap-3">
            {group.titled ? (
              <Reveal entering={reveal(groupIndex)}>
                <VendorTile
                  vendor={group.vendor}
                  storeName={config?.store.name ?? ''}
                  storeLogo={config?.store.logo}
                />
              </Reveal>
            ) : null}
            <Reveal entering={reveal(groupIndex)} leaves className="rounded-2xl bg-surface px-3">
              {group.lines.map((line, index) => (
                <Reveal key={line.key} entering={reveal(groupIndex + index + 1)} leaves>
                  <CartLineRow
                    line={line}
                    divided={index > 0}
                    onRemove={() => router.setParams({ remove: line.key })}
                  />
                </Reveal>
              ))}
            </Reveal>
          </Reveal>
        ))}

        <View className="items-end">
          <Button label={t('addMore')} variant="secondary" onPress={() => router.navigate('/')} />
        </View>
      </ScrollView>

      <CartSummary cart={cart} />

      <RemoveLineSheet line={removing} onClose={() => router.setParams({ remove: undefined })} />
    </View>
  );
}
