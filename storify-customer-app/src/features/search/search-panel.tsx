import { useRouter } from 'expo-router';
import { useRef, useState, type RefObject } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, View } from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { TextLink } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import type { ProductCard as ProductCardData } from '@/contracts/mobile/shop/v1';
import { ProductCard } from '@/features/catalog/product-card';
import { useErrorMessage } from '@/i18n/use-error-message';
import type { ListingQuery } from '@/lib/listing-query';

import { usePaused, useSearchSuggestions } from './use-search';

/** The room kept between the card and the keyboard, or the tab bar when there is no keyboard. */
const GAP = 8;

export type SearchPanelControl = {
  /** The panel shows: the field has the focus and something is typed. */
  open: boolean;
  /** What is typed, once typing has paused: the panel shows its matches. */
  term: string;
  /** Where the panel starts, from the top of the view it is drawn in: just under the field. */
  top: number;
  /** The field's own focus and blur. */
  onFocus: () => void;
  onBlur: () => void;
  /** Closes the panel and puts the keyboard away: a search was made, or the shopper tapped outside. */
  close: () => void;
  /**
   * Told when a touch starts on the panel, before the field loses the focus to
   * it, so the panel stays open for that tap.
   */
  holdOpen: () => boolean;
};

type SearchPanelOptions = {
  /** The field has the focus as the screen opens (`/search?q=lamp`). */
  openAtStart?: boolean;
  /**
   * For a field that scrolls with its page (a list's header): the view the
   * panel is drawn in, and the field's row, which the panel is placed under
   * whenever the field takes the focus. Without them the panel starts at the
   * top of the view it is drawn in.
   */
  pageRef?: RefObject<View | null>;
  fieldRef?: RefObject<View | null>;
};

/**
 * The state of the panel under a search field, for the screen that draws both.
 * It opens once typing pauses while the field has the focus, and closes when
 * the field is emptied or loses the focus, or with `close`.
 */
export function useSearchPanel(
  text: string,
  { openAtStart = false, pageRef, fieldRef }: SearchPanelOptions = {}
): SearchPanelControl {
  const [focused, setFocused] = useState(openAtStart);
  const [top, setTop] = useState(0);
  const touchingPanel = useRef(false);
  const typed = text.trim();
  const term = usePaused(typed);

  const placeUnderField = () => {
    const page = pageRef?.current;
    const field = fieldRef?.current;
    if (!page || !field) return;
    page.measureInWindow((_x, pageTop) =>
      field.measureInWindow((_fx, fieldTop, _width, height) =>
        setTop(Math.max(0, fieldTop + height - pageTop))
      )
    );
  };

  return {
    open: focused && typed.length > 0 && term.length > 0,
    term,
    top,
    onFocus: () => {
      touchingPanel.current = false;
      setFocused(true);
      placeUnderField();
    },
    onBlur: () => {
      if (touchingPanel.current) touchingPanel.current = false;
      else setFocused(false);
    },
    close: () => {
      Keyboard.dismiss();
      setFocused(false);
    },
    holdOpen: () => {
      touchingPanel.current = true;
      return false;
    },
  };
}

type SearchPanelProps = {
  control: SearchPanelControl;
  /** The list the field searches in, when it stands over one. */
  scope?: ListingQuery;
  /** "View All": the whole list of results for what is typed. */
  onViewAll: () => void;
};

/**
 * The card that drops down under the search field, over the page: the first
 * matching products as rows, then "View All". A row opens its product. The
 * page behind is blurred and dimmed, and a tap on it closes the panel. The
 * card ends above the keyboard; when the matches are more than fit, they scroll.
 */
export function SearchPanel({ control, scope, onViewAll }: SearchPanelProps) {
  const t = useTranslations('search');
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const keyboard = useKeyboardState((state) => state.height);
  const tabBar = useTabBarHeight();
  const { term, close } = control;
  const suggestions = useSearchSuggestions(term, scope);
  const items = suggestions.data?.items ?? [];
  const correction = suggestions.data?.searchCorrection;

  const openProduct = (product: ProductCardData) => {
    close();
    router.push({ pathname: '/products/[slug]', params: { slug: product.slug } });
  };

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 bottom-0"
      style={{ top: control.top }}>
      <Backdrop onPress={close} />
      <View
        pointerEvents="box-none"
        className="flex-1 px-4 pt-2"
        style={{ paddingBottom: Math.max(keyboard, tabBar) + GAP }}>
        <View
          onStartShouldSetResponderCapture={control.holdOpen}
          className="shrink overflow-hidden rounded-3xl bg-surface shadow-float">
          {suggestions.isPending ? (
            <ActivityIndicator className="py-6" colorClassName="accent-muted" />
          ) : suggestions.isError ? (
            <Text className="px-4 py-6 text-center text-muted">
              {errorMessage(suggestions.error)}
            </Text>
          ) : items.length === 0 ? (
            <Text className="px-4 py-5 text-center text-muted">{t('noMatches', { term })}</Text>
          ) : (
            <>
              <ScrollView
                className="grow-0"
                keyboardShouldPersistTaps="handled"
                contentContainerClassName="px-4">
                {correction ? (
                  <Text variant="caption" className="pt-3">
                    {t('correction', { term: correction.to })}
                  </Text>
                ) : null}
                {items.map((product, index) => (
                  <View
                    key={product.id}
                    className={index > 0 ? 'border-t border-border' : undefined}>
                    <ProductCard
                      product={product}
                      variant="row"
                      className="py-3"
                      onPress={openProduct}
                    />
                  </View>
                ))}
              </ScrollView>
              <View className="items-center border-t border-border py-3">
                <TextLink
                  label={t('viewAll')}
                  accessibilityLabel={t('viewAllResults', { term })}
                  underline
                  onPress={onViewAll}
                />
              </View>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

/**
 * The page behind, covered by the `surface` at 90 %: the same on both phones
 * (nothing blurs outside the tab bar), so the page shows only as a ghost.
 */
function Backdrop({ onPress }: { onPress: () => void }) {
  const t = useTranslations('search');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('closeSuggestions')}
      onPress={onPress}
      className="absolute inset-0 bg-surface/90"
    />
  );
}
