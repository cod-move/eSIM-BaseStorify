import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { NavRow, RadioRow, RowGroup } from '@/components/ui/rows';
import { SearchField } from '@/components/ui/search-field';
import { Sheet } from '@/components/ui/sheet';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { PRODUCT_STATUSES, type ProductFilterOptions } from '@/contracts/mobile/biz/v1';

import {
  NO_PRODUCT_FILTER,
  childrenOf,
  chosenName,
  isWithin,
  without,
  type ProductFilterKey,
  type ProductFilterValue,
} from './product-filters';
import { useProductFilters } from './use-products';

/** Past this many brands or collections, their screen has a search. */
const SEARCH_FROM = 8;

/** The sheet's screens: the filters, then the choices of one of them. */
type Step =
  | { kind: 'main' }
  | { kind: 'status' }
  | { kind: 'stock' }
  | { kind: 'brand' }
  | { kind: 'collection' }
  /** The categories under `parentId` (the top of the tree at `null`). */
  | { kind: 'category'; parentId: string | null };

/** The filter a step's choices set, for its Reset. */
const STEP_KEY: Record<Exclude<Step['kind'], 'main'>, ProductFilterKey> = {
  status: 'status',
  stock: 'lowStock',
  category: 'categoryId',
  brand: 'brandId',
  collection: 'collectionId',
};

/**
 * The product list's filters in a bottom sheet, as the shopper app's: one
 * row per filter, with what it is set to and a chevron, each opening its
 * choices in the same sheet, with a back button. A category steps down the
 * store's tree, a level at a time. A choice returns to the filters; nothing
 * changes on the list until Done.
 */
export function ProductFilterSheet({
  visible,
  value,
  onApply,
  onClose,
}: {
  visible: boolean;
  value: ProductFilterValue;
  onApply: (value: ProductFilterValue) => void;
  onClose: () => void;
}) {
  const t = useTranslations('products.filters');
  const options = useProductFilters();
  const [draft, setDraft] = useState(value);
  const [steps, setSteps] = useState<Step[]>([{ kind: 'main' }]);
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(visible);
  // Opening the sheet starts from what is applied, on the filters.
  if (visible !== shown) {
    setShown(visible);
    if (visible) {
      setDraft(value);
      setSteps([{ kind: 'main' }]);
      setSearch('');
    }
  }

  const step = steps[steps.length - 1] ?? { kind: 'main' };
  const open = (next: Step) => {
    setSearch('');
    setSteps([...steps, next]);
  };
  const back = () => {
    setSearch('');
    setSteps(steps.slice(0, -1));
  };
  /** A choice made: back to the filters. */
  const choose = (next: ProductFilterValue) => {
    setDraft(next);
    setSearch('');
    setSteps([{ kind: 'main' }]);
  };

  const data = options.data;
  const categoryName =
    step.kind === 'category' && step.parentId
      ? chosenName(data, 'categoryId', step.parentId)
      : undefined;
  const title =
    step.kind === 'main'
      ? t('title')
      : step.kind === 'category'
        ? (categoryName ?? t('category'))
        : t(step.kind);

  let body;
  if (step.kind === 'main') {
    body = <MainStep draft={draft} options={data} onOpen={open} />;
  } else if (step.kind === 'status') {
    body = (
      <RowGroup bare>
        {[null, ...PRODUCT_STATUSES].map((status) => (
          <RadioRow
            key={status ?? 'any'}
            title={status ? t(status) : t('anyStatus')}
            selected={draft.status === status}
            onSelect={() => choose({ ...draft, status })}
          />
        ))}
      </RowGroup>
    );
  } else if (step.kind === 'stock') {
    body = (
      <RowGroup bare>
        <RadioRow
          title={t('anyStock')}
          selected={!draft.lowStock}
          onSelect={() => choose({ ...draft, lowStock: false })}
        />
        <RadioRow
          title={t('lowStock')}
          selected={draft.lowStock}
          onSelect={() => choose({ ...draft, lowStock: true })}
        />
      </RowGroup>
    );
  } else if (options.isPending) {
    body = <LoadingState shape="rows" />;
  } else if (!data) {
    body = <ErrorState error={options.error} onRetry={() => void options.refetch()} />;
  } else if (step.kind === 'category') {
    body = (
      <CategoryStep
        options={data}
        parentId={step.parentId}
        parentName={categoryName}
        selected={draft.categoryId}
        onChoose={(categoryId) => choose({ ...draft, categoryId })}
        onOpen={(parentId) => open({ kind: 'category', parentId })}
      />
    );
  } else {
    const key = step.kind === 'brand' ? 'brandId' : 'collectionId';
    body = (
      <ListStep
        items={step.kind === 'brand' ? data.brands : data.collections}
        anyLabel={t(step.kind === 'brand' ? 'anyBrand' : 'anyCollection')}
        searchLabel={t(step.kind === 'brand' ? 'searchBrands' : 'searchCollections')}
        search={search}
        onSearch={setSearch}
        selected={draft[key]}
        onChoose={(id) => choose({ ...draft, [key]: id })}
      />
    );
  }

  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={onClose}
      onBack={steps.length > 1 ? back : undefined}
      footer={
        <View className="flex-row gap-3">
          <Button
            label={t('reset')}
            variant="secondary"
            className="flex-1"
            onPress={() =>
              setDraft(
                step.kind === 'main' ? NO_PRODUCT_FILTER : without(draft, STEP_KEY[step.kind])
              )
            }
          />
          <Button
            label={t('done')}
            className="flex-1"
            onPress={() => {
              onApply(draft);
              onClose();
            }}
          />
        </View>
      }>
      {body}
    </Sheet>
  );
}

/** The filters, each with what it is set to. */
function MainStep({
  draft,
  options,
  onOpen,
}: {
  draft: ProductFilterValue;
  options: ProductFilterOptions | undefined;
  onOpen: (step: Step) => void;
}) {
  const t = useTranslations('products.filters');
  // Until the store's options arrive, a chosen one reads as chosen.
  const named = (key: 'categoryId' | 'brandId' | 'collectionId', any: string) =>
    draft[key] ? (chosenName(options, key, draft[key]) ?? t('chosen')) : any;
  // A filter the store has nothing for is left out, once its options are known.
  const has = (list: readonly unknown[] | undefined) => list === undefined || list.length > 0;

  return (
    <RowGroup bare>
      <NavRow
        title={t('status')}
        value={draft.status ? t(draft.status) : t('anyStatus')}
        onPress={() => onOpen({ kind: 'status' })}
      />
      <NavRow
        title={t('stock')}
        value={draft.lowStock ? t('lowStock') : t('anyStock')}
        onPress={() => onOpen({ kind: 'stock' })}
      />
      {has(options?.categories) || draft.categoryId ? (
        <NavRow
          title={t('category')}
          value={named('categoryId', t('anyCategory'))}
          onPress={() => onOpen({ kind: 'category', parentId: null })}
        />
      ) : null}
      {has(options?.brands) || draft.brandId ? (
        <NavRow
          title={t('brand')}
          value={named('brandId', t('anyBrand'))}
          onPress={() => onOpen({ kind: 'brand' })}
        />
      ) : null}
      {has(options?.collections) || draft.collectionId ? (
        <NavRow
          title={t('collection')}
          value={named('collectionId', t('anyCollection'))}
          onPress={() => onOpen({ kind: 'collection' })}
        />
      ) : null}
    </RowGroup>
  );
}

/**
 * One level of the category tree: the whole level (every category, or all of
 * the parent's branch), then each category under it. One with categories
 * under it steps down; the others are chosen at once.
 */
function CategoryStep({
  options,
  parentId,
  parentName,
  selected,
  onChoose,
  onOpen,
}: {
  options: ProductFilterOptions;
  parentId: string | null;
  parentName: string | undefined;
  selected: string | null;
  onChoose: (id: string | null) => void;
  onOpen: (parentId: string) => void;
}) {
  const t = useTranslations('products.filters');
  const categories = options.categories;
  const level = childrenOf(categories, parentId);

  return (
    <RowGroup bare>
      <RadioRow
        title={parentId ? t('allIn', { name: parentName ?? '' }) : t('anyCategory')}
        selected={selected === parentId}
        onSelect={() => onChoose(parentId)}
      />
      {level.map((category) =>
        childrenOf(categories, category.id).length > 0 ? (
          <NavRow
            key={category.id}
            title={category.name}
            // A choice further down this branch shows here.
            value={
              selected && isWithin(categories, selected, category.id)
                ? chosenName(options, 'categoryId', selected)
                : undefined
            }
            onPress={() => onOpen(category.id)}
          />
        ) : (
          <RadioRow
            key={category.id}
            title={category.name}
            selected={selected === category.id}
            onSelect={() => onChoose(category.id)}
          />
        )
      )}
    </RowGroup>
  );
}

/** A flat list of choices (brands, collections), with a search when it is long. */
function ListStep({
  items,
  anyLabel,
  searchLabel,
  search,
  onSearch,
  selected,
  onChoose,
}: {
  items: readonly { id: string; name: string }[];
  anyLabel: string;
  searchLabel: string;
  search: string;
  onSearch: (text: string) => void;
  selected: string | null;
  onChoose: (id: string | null) => void;
}) {
  const t = useTranslations('products.filters');
  const term = search.trim().toLowerCase();
  const found = term ? items.filter((item) => item.name.toLowerCase().includes(term)) : items;

  return (
    <View className="gap-3">
      {items.length > SEARCH_FROM ? (
        <SearchField label={searchLabel} value={search} onChangeText={onSearch} />
      ) : null}
      <RowGroup bare>
        {term ? null : (
          <RadioRow title={anyLabel} selected={selected === null} onSelect={() => onChoose(null)} />
        )}
        {found.map((item) => (
          <RadioRow
            key={item.id}
            title={item.name}
            selected={selected === item.id}
            onSelect={() => onChoose(item.id)}
          />
        ))}
      </RowGroup>
      {term && found.length === 0 ? (
        <EmptyState icon="search" placement="top" title={t('noMatch', { search: search.trim() })} />
      ) : null}
    </View>
  );
}
