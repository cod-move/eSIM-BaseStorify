import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { NavRow, RadioRow } from '@/components/ui/rows';
import { Sheet, SheetActions } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import type { PriceRange, ProductSort } from '@/contracts/mobile/shop/v1';
import type { ListingQuery } from '@/lib/listing-query';

import { PriceSlider } from './price-slider';
import { defaultSort, sortsFor, type BrandTile } from './use-browse';

/** What the sheet sets on the listing. `undefined` clears a filter. */
export type ListingChoice = Pick<
  ListingQuery,
  'sort' | 'brand' | 'inStock' | 'onSale' | 'minPrice' | 'maxPrice'
>;

type FilterSheetProps = {
  visible: boolean;
  /** Open on the Sort page (the order alone), or on the whole Filter sheet. */
  page: 'filter' | 'sort';
  query: ListingQuery;
  brands: BrandTile[];
  priceRange?: PriceRange;
  onClose: () => void;
  onApply: (choice: ListingChoice) => void;
};

function choiceOf(query: ListingQuery): ListingChoice {
  return {
    sort: query.sort,
    brand: query.brand,
    inStock: query.inStock,
    onSale: query.onSale,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
  };
}

/**
 * The Filter sheet and its Sort page. Only what the store
 * sends for this listing is offered: its brands, its price range. Nothing
 * changes until Apply or Done, which close the sheet and reload the list.
 */
export function FilterSheet({
  visible,
  page: firstPage,
  query,
  brands,
  priceRange,
  onClose,
  onApply,
}: FilterSheetProps) {
  const t = useTranslations('browse');
  const [page, setPage] = useState(firstPage);
  const [draft, setDraft] = useState(() => choiceOf(query));
  const [open, setOpen] = useState(visible);

  // A fresh draft each time the sheet opens, from what the list shows now.
  if (visible !== open) {
    setOpen(visible);
    if (visible) {
      setPage(firstPage);
      setDraft(choiceOf(query));
    }
  }
  const set = (next: Partial<ListingChoice>) => setDraft((now) => ({ ...now, ...next }));
  const sort = draft.sort ?? defaultSort(query);
  const reset = () =>
    page === 'sort'
      ? set({ sort: undefined })
      : setDraft({
          sort: undefined,
          brand: undefined,
          inStock: undefined,
          onSale: undefined,
          minPrice: undefined,
          maxPrice: undefined,
        });

  const footer = (
    <SheetActions>
      <Button variant="outline" label={t('reset')} onPress={reset} />
      <Button
        label={page === 'sort' && firstPage === 'sort' ? t('done') : t('apply')}
        onPress={() => onApply(draft)}
      />
    </SheetActions>
  );

  return (
    <Sheet
      visible={visible}
      title={page === 'sort' ? t('sortBy') : t('filter')}
      onClose={onClose}
      onBack={page === 'sort' && firstPage === 'filter' ? () => setPage('filter') : undefined}
      footer={footer}>
      {page === 'sort' ? (
        <View className="px-4">
          {sortsFor(query).map((option) => (
            <RadioRow
              key={option}
              title={t(`sorts.${option}`)}
              selected={sort === option}
              onSelect={() => set({ sort: option === defaultSort(query) ? undefined : option })}
            />
          ))}
        </View>
      ) : (
        <View className="gap-6 px-4 pb-4">
          <NavRow
            title={t('sortBy')}
            value={t(`sorts.${sort as ProductSort}`)}
            onPress={() => setPage('sort')}
          />
          {brands.length > 1 ? (
            <Section title={t('brands')}>
              <ChipRow
                options={brands.map((brand) => ({ value: brand.slug, label: brand.name }))}
                value={draft.brand}
                onChange={(brand) => set({ brand })}
                allLabel={t('all')}
              />
            </Section>
          ) : null}
          <Section title={t('availability')}>
            <ChipRow
              options={[{ value: 'in-stock', label: t('inStock') }]}
              value={draft.inStock ? 'in-stock' : undefined}
              onChange={(value) => set({ inStock: value ? true : undefined })}
              allLabel={t('all')}
            />
          </Section>
          {priceRange ? (
            <Section title={t('price')}>
              <PriceSlider
                range={priceRange}
                min={draft.minPrice}
                max={draft.maxPrice}
                onChange={set}
              />
            </Section>
          ) : null}
        </View>
      )}
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Text variant="heading">{title}</Text>
      {children}
    </View>
  );
}

type ChipRowProps = {
  options: { value: string; label: string }[];
  /** The chosen option; `undefined` is "All", no filter. */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  allLabel: string;
};

function ChipRow({ options, value, onChange, allLabel }: ChipRowProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
      <Chip label={allLabel} selected={value === undefined} onPress={() => onChange(undefined)} />
      {options.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          selected={value === option.value}
          onPress={() => onChange(option.value)}
        />
      ))}
    </ScrollView>
  );
}
