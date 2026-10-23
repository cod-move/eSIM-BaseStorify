import type { ProductDetail, ReviewLimits } from '@/contracts/mobile/shop/v1';
import { useSession } from '@/features/auth/use-session';
import { useMeProduct } from '@/features/catalog/use-wishlist';
import { useProduct } from '@/features/product/use-product';

export type ReviewTarget =
  | { status: 'pending' }
  | { status: 'error'; error: unknown; retry: () => void }
  /** Not signed in, or the store does not let the shopper review it. */
  | { status: 'closed' }
  | { status: 'open'; product: ProductDetail; limits: ReviewLimits };

/** The product a review is written of, and whether the store lets the shopper write one. */
export function useReviewTarget(slug: string): ReviewTarget {
  const { isSignedIn } = useSession();
  const product = useProduct(slug);
  const me = useMeProduct(product.data?.id);

  if (!isSignedIn) return { status: 'closed' };
  if (product.isError)
    return { status: 'error', error: product.error, retry: () => void product.refetch() };
  if (me.isError) return { status: 'error', error: me.error, retry: () => void me.refetch() };
  if (!product.data || !me.data) return { status: 'pending' };
  if (!me.data.canReview || !me.data.reviewLimits) return { status: 'closed' };
  return { status: 'open', product: product.data, limits: me.data.reviewLimits };
}
