import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { Stepper } from '@/components/ui/stepper';
import { Text } from '@/components/ui/text';
import type { CartLine } from '@/contracts/mobile/shop/v1';
import { ProductLink } from '@/features/catalog/product-link';
import { useOpenProduct } from '@/features/catalog/use-open-product';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cn } from '@/lib/cn';

import { useLineQuantity } from './use-line-quantity';

type CartLineRowProps = {
  line: CartLine;
  /** Asks to remove the line: the screen confirms first. */
  onRemove: () => void;
  /** A divider above the row: every line of a card but the first. */
  divided: boolean;
};

/**
 * One line of the cart: picture, name, options, the stepper and the
 * line's price as the store sent it. A flagged line says why it blocks
 * checkout and offers its fix.
 */
export function CartLineRow({ line, onRemove, divided }: CartLineRowProps) {
  const describe = useErrorMessage();
  const quantity = useLineQuantity(line);

  return (
    <View className={cn('gap-2 py-3', divided && 'border-t border-border')}>
      <CartLineBody
        line={line}
        linked
        note={
          line.reason ? (
            <LineFlag line={line} onRemove={onRemove} onLower={quantity.change} />
          ) : null
        }>
        <View className="flex-row items-center justify-between gap-2">
          <Stepper
            value={quantity.quantity}
            onChange={quantity.change}
            max={line.maxQuantity}
            removable
            onRemove={onRemove}
            busy={quantity.busy}
          />
          <Text variant="price">{line.lineTotal.formatted}</Text>
        </View>
      </CartLineBody>
      {quantity.error ? (
        <Text variant="caption" className="text-danger">
          {describe(quantity.error)}
        </Text>
      ) : null}
    </View>
  );
}

type CartLineBodyProps = {
  line: CartLine;
  /** The picture and the name open the product's page. Off for the line in "Remove from Cart?". */
  linked?: boolean;
  /** Under the options: the flagged line's message. */
  note?: ReactNode;
  /** At the bottom: the stepper and the price, or the price alone. */
  children: ReactNode;
};

const WELL = 'size-[110px] overflow-hidden rounded-xl bg-surface-alt p-1';

/**
 * The line without its controls: the cart's row, and the line in "Remove from
 * Cart?". Linked, the picture and the name are two ways into the product's
 * page, beside the stepper and the rest of the controls rather than around them.
 */
export function CartLineBody({ line, linked = false, note, children }: CartLineBodyProps) {
  // The picture nearly fills its grey well: a thin margin, no tile of its own.
  const picture = (
    <AppImage
      image={line.image}
      size="card"
      contentFit="contain"
      className="size-full bg-transparent"
      decorative
    />
  );
  const title = (
    <>
      <Text variant="subheading" numberOfLines={2}>
        {line.name}
      </Text>
      {line.variantLabel ? <Text variant="caption">{line.variantLabel}</Text> : null}
    </>
  );

  return (
    <View className="flex-row gap-3">
      {linked ? (
        <ProductLink product={line} duplicate className={WELL}>
          {picture}
        </ProductLink>
      ) : (
        <View className={WELL}>{picture}</View>
      )}
      <View className="flex-1 justify-between gap-2 py-1">
        <View className="gap-1">
          {linked ? (
            <ProductLink product={line} className="gap-1">
              {title}
            </ProductLink>
          ) : (
            title
          )}
          {note}
        </View>
        {children}
      </View>
    </View>
  );
}

type LineFlagProps = {
  line: CartLine;
  onRemove: () => void;
  onLower: (quantity: number) => void;
};

/** Why the store will not check this line out, and the one thing that fixes it. */
function LineFlag({ line, onRemove, onLower }: LineFlagProps) {
  const t = useTranslations('cart');
  const openProduct = useOpenProduct();
  if (!line.reason) return null;

  const fix =
    line.reason === 'QUANTITY_LIMITED' && line.maxQuantity > 0
      ? { label: t('fix.lower', { max: line.maxQuantity }), run: () => onLower(line.maxQuantity) }
      : line.reason === 'VARIANT_REQUIRED'
        ? { label: t('fix.choose'), run: () => openProduct(line) }
        : { label: t('fix.remove'), run: onRemove };

  return (
    <View className="items-start">
      <Text variant="caption" className="text-warning">
        {t(`reason.${line.reason}`, { max: line.maxQuantity })}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={fix.label}
        onPress={fix.run}
        className="min-h-11 justify-center active:opacity-60">
        <Text variant="chip" className="text-primary">
          {fix.label}
        </Text>
      </Pressable>
    </View>
  );
}
