import type { ReactNode } from 'react';
import { View } from 'react-native';

import { CountBadge, DiscountPill, StatusBadge } from '@/components/ui/badge';
import { Button, TextLink } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Divider } from '@/components/ui/divider';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Price } from '@/components/ui/price';
import { CompactRating, StarRating } from '@/components/ui/rating';
import { SectionHeader } from '@/components/ui/section-header';
import type { Money } from '@/contracts/mobile/shop/v1';

import { GalleryItem, GalleryPage, GallerySection } from './gallery-kit';

const noop = () => {};
const money = (formatted: string): Money => ({ amount: 0, currency: 'USD', formatted });
const PRICE = money('$24.00');
const WAS = money('$30.00');
const rating = (average: number, count = 350) => ({ average, count });

const KINDS = ['primary', 'accent', 'secondary', 'outline', 'ghost', 'social', 'danger'] as const;
const STATUSES = [
  'pending',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
  'preordered',
];

/** A control held in its pressed look (90 % opacity), which a still page cannot press. */
const Held = ({ children }: { children: ReactNode }) => (
  <View pointerEvents="none" className="opacity-90">
    {children}
  </View>
);

function Buttons() {
  return (
    <GallerySection title="Buttons">
      {KINDS.map((kind) => (
        <GalleryItem key={kind} label={`${kind} · 48 pt`}>
          <Button label="Add to cart" variant={kind} onPress={noop} />
        </GalleryItem>
      ))}
      <GalleryItem label="outline · 32 pt">
        <View className="flex-row gap-3">
          <Button label="Change location" variant="outline" size="sm" onPress={noop} />
          <Button label="Add" variant="outline" size="sm" icon="plus" onPress={noop} />
        </View>
      </GalleryItem>
      <GalleryItem label="ghost · 32 pt">
        <View className="flex-row gap-3">
          <Button label="Add address details" variant="ghost" size="sm" onPress={noop} />
          <Button label="Notes" variant="ghost" size="sm" onPress={noop} />
        </View>
      </GalleryItem>
      <GalleryItem label="leading icon">
        <Button label="Proceed to Checkout" icon="cart" onPress={noop} />
      </GalleryItem>
      <GalleryItem label="social · leading mark">
        <Button
          label="Continue with Google"
          variant="social"
          leading={<Icon name="globe" size={20} />}
          onPress={noop}
        />
      </GalleryItem>
      <GalleryItem label="accent · trailing amount">
        <Button label="Pay Now" variant="accent" trailing="$3,397.00" onPress={noop} />
      </GalleryItem>
      <GalleryItem label="primary · loading">
        <Button label="Add to cart" loading onPress={noop} />
      </GalleryItem>
      <GalleryItem label="accent · loading, trailing amount">
        <Button label="Pay Now" variant="accent" trailing="$3,397.00" loading onPress={noop} />
      </GalleryItem>
      <GalleryItem label="primary · disabled">
        <Button label="Add to cart" disabled onPress={noop} />
      </GalleryItem>
      <GalleryItem label="secondary · disabled">
        <Button label="Cancel" variant="secondary" disabled onPress={noop} />
      </GalleryItem>
      <GalleryItem label="primary · pressed">
        <Held>
          <Button label="Add to cart" onPress={noop} />
        </Held>
      </GalleryItem>
      <GalleryItem label="Two side by side · 12 pt gap">
        <View className="flex-row gap-3">
          <Button label="Reset" variant="secondary" className="flex-1" onPress={noop} />
          <Button label="Apply" className="flex-1" onPress={noop} />
        </View>
      </GalleryItem>
      <GalleryItem label="Two stacked · 8 pt gap">
        <View className="gap-2">
          <Button label="Buy Now" variant="accent" onPress={noop} />
          <Button label="Add to cart" onPress={noop} />
        </View>
      </GalleryItem>
      <GalleryItem label="Text link · link, underlined, foreground, disabled">
        <View className="flex-row flex-wrap items-center gap-6">
          <TextLink label="View All" onPress={noop} />
          <TextLink label="View E-Receipt" underline onPress={noop} />
          <TextLink label="Send a new code" tone="foreground" onPress={noop} />
          <TextLink label="Forgot Password?" disabled onPress={noop} />
        </View>
      </GalleryItem>
    </GallerySection>
  );
}

function IconButtons() {
  return (
    <GallerySection title="Icon buttons">
      <GalleryItem label="floating · 33 pt: back, close, share, disabled">
        <View className="flex-row gap-4">
          <IconButton icon="arrow-left" label="Back" directional onPress={noop} />
          <IconButton icon="close" label="Close" onPress={noop} />
          <IconButton icon="share" label="Share" onPress={noop} />
          <IconButton icon="share" label="Share" disabled onPress={noop} />
        </View>
      </GalleryItem>
      <GalleryItem label="outlined · 37 pt: heart off, on">
        <View className="flex-row gap-4">
          <IconButton icon="heart" label="Add to wishlist" variant="outlined" onPress={noop} />
          <IconButton
            icon="heart"
            label="Remove from wishlist"
            variant="outlined"
            selected
            onPress={noop}
          />
        </View>
      </GalleryItem>
      <GalleryItem label="solid · 25 pt: the card's cart button, disabled">
        <View className="flex-row gap-4">
          <IconButton icon="cart-plus" label="Add to cart" variant="solid" onPress={noop} />
          <IconButton
            icon="cart-plus"
            label="Add to cart"
            variant="solid"
            disabled
            onPress={noop}
          />
        </View>
      </GalleryItem>
      <GalleryItem label="floating · pressed">
        <Held>
          <IconButton icon="close" label="Close" onPress={noop} />
        </Held>
      </GalleryItem>
      <GalleryItem label="with a count: 0 (none), 3, 99, 100">
        <View className="flex-row gap-5">
          {[0, 3, 99, 100].map((count) => (
            <IconButton key={count} icon="cart" label="Cart" count={count} onPress={noop} />
          ))}
        </View>
      </GalleryItem>
    </GallerySection>
  );
}

function Chips() {
  return (
    <GallerySection title="Chips">
      <GalleryItem label="picture · selected, unselected, disabled">
        <View className="flex-row flex-wrap gap-2">
          <Chip kind="picture" label="Phones" selected onPress={noop} />
          <Chip kind="picture" label="Laptops" onPress={noop} />
          <Chip kind="picture" label="Watches" disabled onPress={noop} />
        </View>
      </GalleryItem>
      <GalleryItem label="filter · selected, unselected, disabled">
        <View className="flex-row flex-wrap gap-2">
          <Chip label="All" selected onPress={noop} />
          <Chip label="In stock" onPress={noop} />
          <Chip label="Pre-order" onPress={noop} />
          <Chip label="Out of stock" disabled onPress={noop} />
        </View>
      </GalleryItem>
      <GalleryItem label="option text · selected, unselected, unavailable, disabled">
        <View className="flex-row flex-wrap gap-2">
          <Chip kind="option" label="128 GB" selected onPress={noop} />
          <Chip kind="option" label="256 GB" onPress={noop} />
          <Chip kind="option" label="512 GB" unavailable onPress={noop} />
          <Chip kind="option" label="1 TB" disabled onPress={noop} />
        </View>
      </GalleryItem>
      <GalleryItem label="option swatch · selected, unselected, unavailable">
        <View className="flex-row flex-wrap gap-2">
          <Chip kind="option" label="Blue" swatch="#2b6bff" selected onPress={noop} />
          <Chip kind="option" label="Silver" swatch="#c0c0c0" onPress={noop} />
          <Chip kind="option" label="Gold" swatch="#d4af37" unavailable onPress={noop} />
        </View>
      </GalleryItem>
    </GallerySection>
  );
}

function Badges() {
  return (
    <GallerySection title="Badges">
      <GalleryItem label="count · 0 (nothing), 1, 12, 99, 100, then danger and primary">
        <View className="flex-row items-center gap-3">
          {[0, 1, 12, 99, 100].map((count) => (
            <CountBadge key={count} count={count} />
          ))}
          <CountBadge count={4} tone="danger" />
          <CountBadge count={4} tone="primary" />
        </View>
      </GalleryItem>
      <GalleryItem label="status · the known statuses">
        <View className="flex-row flex-wrap gap-2">
          {STATUSES.map((status) => (
            <StatusBadge key={status} status={status} />
          ))}
        </View>
      </GalleryItem>
      <GalleryItem label="status · one the app does not know">
        <StatusBadge status="awaiting_stock" />
      </GalleryItem>
      <GalleryItem label="discount pill · md, sm">
        <View className="flex-row items-center gap-3">
          <DiscountPill label="-20%" />
          <DiscountPill label="-20%" size="sm" />
        </View>
      </GalleryItem>
    </GallerySection>
  );
}

function Ratings() {
  return (
    <GallerySection title="Ratings">
      <GalleryItem label="compact · average">
        <CompactRating rating={rating(4.5)} />
      </GalleryItem>
      <GalleryItem label="compact · average and count">
        <CompactRating rating={rating(4.5)} showCount />
      </GalleryItem>
      <GalleryItem label="compact · count only (seller tile)">
        <CompactRating rating={rating(4.5)} showAverage={false} showCount />
      </GalleryItem>
      <GalleryItem label="compact · small, with sold">
        <CompactRating rating={rating(4.2, 12)} size="sm" soldCount={34} />
      </GalleryItem>
      {[5, 4.5, 4.3, 3.2, 0.5, 0].map((average) => (
        <GalleryItem key={average} label={`full · ${average}`}>
          <StarRating rating={rating(average)} soldCount={average === 4.5 ? 1200 : undefined} />
        </GalleryItem>
      ))}
    </GallerySection>
  );
}

function Prices() {
  return (
    <GallerySection title="Prices">
      <GalleryItem label="current · sm, md, lg">
        <View className="flex-row items-end gap-6">
          <Price price={PRICE} size="sm" />
          <Price price={PRICE} />
          <Price price={PRICE} size="lg" />
        </View>
      </GalleryItem>
      <GalleryItem label="compare-at and the store's discount">
        <Price price={PRICE} compareAt={WAS} discountLabel="-20%" />
      </GalleryItem>
      <GalleryItem label="lg · compare-at and discount">
        <Price price={PRICE} compareAt={WAS} discountLabel="-20%" size="lg" />
      </GalleryItem>
      <GalleryItem label="compare-at, no discount label">
        <Price price={PRICE} compareAt={WAS} />
      </GalleryItem>
      <GalleryItem label="from">
        <Price price={PRICE} from />
      </GalleryItem>
      <GalleryItem label="price on request">
        <Price onRequest />
      </GalleryItem>
    </GallerySection>
  );
}

function Structure() {
  return (
    <GallerySection title="Divider and section header">
      <GalleryItem label="divider · horizontal">
        <Divider />
      </GalleryItem>
      <GalleryItem label="divider · vertical">
        <View className="h-6 flex-row items-center gap-3">
          <Price price={PRICE} />
          <Divider vertical />
          <Price price={WAS} />
        </View>
      </GalleryItem>
      <GalleryItem label="section header · with View All">
        <SectionHeader title="Featured Products" onViewAll={noop} />
      </GalleryItem>
      <GalleryItem label="section header · without">
        <SectionHeader title="Payment Method" />
      </GalleryItem>
    </GallerySection>
  );
}

/** Every control of `src/components/ui`, each in every state, for light, dark and right to left. */
export function ControlsGallery() {
  return (
    <GalleryPage>
      <Buttons />
      <IconButtons />
      <Chips />
      <Badges />
      <Ratings />
      <Prices />
      <Structure />
    </GalleryPage>
  );
}
