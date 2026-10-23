import { SellerTile, type SellerTileVendor } from '@/features/catalog/seller-tile';

type ProductSellerProps = {
  /** The seller, or the brand of a one-shop store (a name and a logo). */
  vendor: SellerTileVendor;
  onPress?: () => void;
};

/** The seller in the product page's header: the shared seller tile, filling the row beside the heart. */
export function ProductSeller({ vendor, onPress }: ProductSellerProps) {
  return <SellerTile vendor={vendor} onPress={onPress} className="flex-1" />;
}
