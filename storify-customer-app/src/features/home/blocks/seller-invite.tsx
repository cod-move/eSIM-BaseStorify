import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { AppImage } from '@/components/ui/app-image';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import type { SellerInviteBlock } from '@/contracts/mobile/shop/v1';

/**
 * The invitation to sell on the store: its heading, its button and its
 * picture. The block's paragraph is left out on a phone. Selling happens in
 * the Storify Business app: the button opens its page (`/sell`), whatever the
 * website's sign-up address.
 */
export function SellerInvite({ block }: { block: SellerInviteBlock }) {
  const router = useRouter();

  return (
    <View className="px-4">
      <View className="gap-5 overflow-hidden rounded-3xl bg-surface px-5 pt-6 pb-5">
        <Text variant="display" accessibilityRole="header">
          {block.title}
        </Text>
        <Button
          label={block.cta.label}
          onPress={() => router.push('/sell')}
          accessibilityRole="link"
          className="self-start"
        />
        {block.image ? (
          // The picture runs to the card's edges and its foot, as large as the card allows.
          <AppImage
            image={block.image}
            size="full"
            contentFit="cover"
            aspectRatio={1.9}
            className="-mx-5 -mb-5 bg-transparent"
            decorative
          />
        ) : null}
      </View>
    </View>
  );
}
