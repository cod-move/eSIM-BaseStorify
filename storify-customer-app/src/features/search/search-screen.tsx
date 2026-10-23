import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { Reveal, useReveal } from '@/components/ui/motion';
import { SearchField } from '@/components/ui/search-field';

import { useRecentSearches } from './recent-searches';
import { SearchPanel, useSearchPanel } from './search-panel';
import { SearchStart } from './search-start';

/**
 * The Search tab: the field, and under it what to search for. Once typing
 * pauses, a panel of the first matches opens over the page; it closes when the
 * field is emptied or loses the focus, or the page behind is tapped or
 * scrolled. Submitting opens the full list.
 */
export function SearchScreen() {
  const t = useTranslations('search');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomSpace = useTabBarHeight();
  const addRecent = useRecentSearches((state) => state.add);
  const reveal = useReveal();
  // `/search?q=lamp`, as on the website, opens with the term typed and its panel open.
  const params = useLocalSearchParams<{ q?: string }>();
  const [text, setText] = useState(params.q ?? '');
  const panel = useSearchPanel(text, { openAtStart: Boolean(params.q) });

  const search = (value: string) => {
    const q = value.trim();
    if (!q) return;
    addRecent(q);
    panel.close();
    router.push({ pathname: '/products', params: { q } });
  };

  return (
    <View className="flex-1 bg-background">
      {/* The field runs the header's whole width: a tab has no back button. */}
      <View className="bg-background" style={{ paddingTop: insets.top }}>
        <View className="min-h-14 justify-center px-4 py-2">
          <SearchField
            autoFocus={Boolean(params.q)}
            label={t('fieldLabel')}
            placeholder={t('placeholder')}
            value={text}
            onChangeText={setText}
            onSubmit={search}
            onFocus={panel.onFocus}
            onBlur={panel.onBlur}
          />
        </View>
        <View className="mx-4 h-px bg-border" />
      </View>
      <View className="flex-1">
        {/* The panel holds a blur: it stays out of the reveal. */}
        <Reveal entering={reveal(0)} className="flex-1">
          <SearchStart onSearch={search} onScrollStart={panel.close} bottomSpace={bottomSpace} />
        </Reveal>
        {panel.open ? <SearchPanel control={panel} onViewAll={() => search(text)} /> : null}
      </View>
    </View>
  );
}
