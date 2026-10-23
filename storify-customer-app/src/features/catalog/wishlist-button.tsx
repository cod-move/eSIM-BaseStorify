import { useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';

import { useSession } from '@/features/auth/use-session';

import { HeartButton } from './product-card-parts';
import { useMeProduct, useToggleWishlist } from './use-wishlist';

/** The heart on the product page. A guest who taps it is taken to sign in. */
export function WishlistButton({ productId }: { productId: string }) {
  const t = useTranslations('product');
  const router = useRouter();
  const { isSignedIn } = useSession();
  const inWishlist = useMeProduct(productId).data?.inWishlist ?? false;
  const toggle = useToggleWishlist(productId);

  return (
    <HeartButton
      accessibilityLabel={inWishlist ? t('removeFromWishlist') : t('addToWishlist')}
      accessibilityState={{ selected: inWishlist }}
      active={inWishlist}
      onPress={() => (isSignedIn ? toggle.mutate(!inWishlist) : router.push('/login'))}
      iconSize={20}
      tone="danger"
      idleTint="accent-foreground"
      hitSlop={8}
      className="size-11 items-center justify-center rounded-full border border-border active:opacity-60"
    />
  );
}
