import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { NavRow, RadioRow, RowGroup } from '@/components/ui/rows';
import { Sheet, SheetActions, SheetPanel } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { ToastPill, useToast } from '@/components/ui/toast';

import { GalleryItem, GalleryPage, GallerySection } from './gallery-kit';

const noop = () => {};

/** The space a sheet is drawn in on the page: a phone's screen, a little shorter. */
const FRAME_HEIGHT = 700;

const REVIEWS = [
  {
    name: 'Amelia R.',
    title: 'Worth every penny',
    body: 'The leather is soft, the stitching is clean and it arrived two days early.',
  },
  {
    name: 'Jonas K.',
    title: 'Good, runs small',
    body: 'Order a size up. Otherwise a lovely pair that has held up through a wet month.',
  },
  {
    name: 'Priya S.',
    title: 'Exactly as pictured',
    body: 'The colour matches the photos and the sole is comfortable from the first walk.',
  },
  {
    name: 'Marcus T.',
    title: 'Fine for the price',
    body: 'Nothing special, nothing wrong. The box was a little damaged but the pair was fine.',
  },
  {
    name: 'Lena W.',
    title: 'My new daily pair',
    body: 'I wear them to the office and on weekends. Easy to clean and they go with everything.',
  },
  {
    name: 'Omar H.',
    title: 'Quick delivery',
    body: 'Came well packed. The laces are on the short side, so I swapped them.',
  },
];

const ADDRESSES = [
  { title: 'Home', description: '221B Baker Street, London NW1 6XE' },
  { title: 'Office', description: '1 Canada Square, Canary Wharf, London E14 5AB' },
  { title: 'Parents', description: '14 Orchard Lane, Bristol BS1 4DJ' },
];

const SORTS = ['Relevance', 'Newest', 'Price: low to high', 'Price: high to low', 'Top rated'];
const BRANDS = ['Northwind', 'Alder & Co', 'Fenwick', 'Marlow', 'Tidewater'];
const COLOURS = ['Black', 'White', 'Tan', 'Navy', 'Olive'];

type Use = 'reviews' | 'filter' | 'sort' | 'address' | 'remove';

type SheetUse = {
  title: string;
  size?: 'fit' | 'tall';
  onBack?: () => void;
  footer?: ReactNode;
  body: ReactNode;
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Text variant="heading">{title}</Text>
      {children}
    </View>
  );
}

/** A sheet drawn in place over a dimmed page, as it opens on a phone. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <View
      style={{ height: FRAME_HEIGHT }}
      className="justify-end overflow-hidden rounded-lg bg-scrim/80">
      {children}
    </View>
  );
}

/** The four uses of a sheet and the one that steps out of another. */
function useSheets() {
  const [open, setOpen] = useState<Use | null>(null);
  const [sort, setSort] = useState('Newest');
  const [colour, setColour] = useState<string | null>('Tan');
  const [brand, setBrand] = useState<string | null>(null);
  const [address, setAddress] = useState(0);

  const close = () => setOpen(null);

  const uses: Record<Use, SheetUse> = {
    reviews: {
      title: 'Reviews',
      size: 'tall',
      body: (
        <View className="gap-6">
          {REVIEWS.map((review) => (
            <View key={review.name} className="gap-1.5">
              <Text variant="label">{review.name}</Text>
              <Text variant="subheading">{review.title}</Text>
              <Text variant="long" className="text-muted">
                {review.body}
              </Text>
            </View>
          ))}
        </View>
      ),
    },
    filter: {
      title: 'Filter',
      footer: (
        <SheetActions>
          <Button
            label="Reset"
            variant="secondary"
            onPress={() => {
              setColour(null);
              setBrand(null);
            }}
          />
          <Button label="Apply" onPress={close} />
        </SheetActions>
      ),
      body: (
        <View className="gap-6">
          <RowGroup card={false}>
            <NavRow title="Sort by" value={sort} onPress={() => setOpen('sort')} />
          </RowGroup>
          <Section title="Colour">
            <View className="flex-row flex-wrap gap-2">
              {COLOURS.map((name) => (
                <Chip
                  key={name}
                  label={name}
                  selected={colour === name}
                  onPress={() => setColour(name)}
                />
              ))}
            </View>
          </Section>
          <Section title="Brand">
            <View className="flex-row flex-wrap gap-2">
              {BRANDS.map((name) => (
                <Chip
                  key={name}
                  label={name}
                  selected={brand === name}
                  onPress={() => setBrand(name)}
                />
              ))}
            </View>
          </Section>
        </View>
      ),
    },
    sort: {
      title: 'Sort by',
      onBack: () => setOpen('filter'),
      footer: <Button label="Apply" onPress={() => setOpen('filter')} />,
      body: (
        <RowGroup card={false} accessibilityRole="radiogroup">
          {SORTS.map((name) => (
            <RadioRow
              key={name}
              title={name}
              selected={sort === name}
              onSelect={() => setSort(name)}
            />
          ))}
        </RowGroup>
      ),
    },
    address: {
      title: 'Address',
      footer: <Button label="Apply" onPress={close} />,
      body: (
        <RowGroup accessibilityRole="radiogroup">
          {ADDRESSES.map((item, index) => (
            <RadioRow
              key={item.title}
              title={item.title}
              description={item.description}
              selected={address === index}
              onSelect={() => setAddress(index)}
            />
          ))}
        </RowGroup>
      ),
    },
    remove: {
      title: 'Remove from Cart',
      footer: (
        <SheetActions>
          <Button label="Cancel" variant="secondary" onPress={close} />
          <Button label="Yes, Remove" onPress={close} />
        </SheetActions>
      ),
      body: (
        <Text variant="long" className="text-center">
          Are you sure you want to remove this product from your cart?
        </Text>
      ),
    },
  };

  return { open, setOpen, close, uses };
}

const ITEMS: { use: Use; label: string }[] = [
  { use: 'reviews', label: 'Tall · scrolling body (Reviews)' },
  { use: 'filter', label: 'Fit · pinned two-button footer (Filter)' },
  { use: 'sort', label: 'Sub-sheet · back button at the start (Sort by)' },
  { use: 'address', label: 'Fit · radio rows with Apply (Address)' },
  { use: 'remove', label: 'Fit · short confirmation (Remove from Cart)' },
];

function Sheets() {
  const { open, setOpen, close, uses } = useSheets();

  return (
    <GallerySection title="Bottom sheet">
      {ITEMS.map(({ use, label }) => {
        const { body, ...sheet } = uses[use];
        return (
          <GalleryItem key={use} label={label}>
            <Frame>
              <SheetPanel {...sheet} onClose={noop} frameHeight={FRAME_HEIGHT}>
                {body}
              </SheetPanel>
            </Frame>
            <Button
              label={`Open ${sheet.title}`}
              variant="outline"
              size="sm"
              onPress={() => setOpen(use)}
            />
          </GalleryItem>
        );
      })}
      {ITEMS.map(({ use }) => {
        const { body, ...sheet } = uses[use];
        return (
          <Sheet key={use} visible={open === use} {...sheet} onClose={close}>
            {body}
          </Sheet>
        );
      })}
    </GallerySection>
  );
}

function Toasts() {
  const toast = useToast();

  return (
    <GallerySection title="Toast">
      <GalleryItem label="Message only">
        <View className="items-center">
          <ToastPill message="Address saved" />
        </View>
      </GalleryItem>
      <GalleryItem label="With an action">
        <View className="items-center">
          <ToastPill message="Added to cart" action={{ label: 'View cart', onPress: noop }} />
        </View>
      </GalleryItem>
      <GalleryItem label="Two lines">
        <View className="items-center">
          <ToastPill
            message="That coupon has expired. Pick another one from your list."
            action={{ label: 'Undo', onPress: noop }}
          />
        </View>
      </GalleryItem>
      <GalleryItem label="Live: appears above the tab bar for about 4 s">
        <View className="flex-row gap-3">
          <Button
            label="Show"
            variant="outline"
            size="sm"
            onPress={() => toast.show({ message: 'Address saved' })}
          />
          <Button
            label="Show with action"
            variant="outline"
            size="sm"
            onPress={() =>
              toast.show({
                message: 'Added to cart',
                action: { label: 'View cart', onPress: noop },
              })
            }
          />
        </View>
      </GalleryItem>
    </GallerySection>
  );
}

/** The sheets and the toast of `src/components/ui`, drawn in place and opened for real. */
export function OverlaysGallery() {
  return (
    <GalleryPage>
      <Sheets />
      <Toasts />
    </GalleryPage>
  );
}
