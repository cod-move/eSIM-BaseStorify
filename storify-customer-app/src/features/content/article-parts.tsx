import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { useBottomSpace } from '@/components/shell/tab-bar';
import { RichText } from '@/components/ui/rich-text';
import { Text } from '@/components/ui/text';
import { useOpenLink } from '@/features/config/use-open-link';

type ArticleScrollProps = {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
};

/** The page an article is read on: one column, clear of the tab bar, pulled down to refresh. */
export function ArticleScroll({ children, refreshing = false, onRefresh }: ArticleScrollProps) {
  const bottom = useBottomSpace();
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 px-4 pt-4"
      contentContainerStyle={{ paddingBottom: bottom + 24 }}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
      }>
      {children}
    </ScrollView>
  );
}

/** An article's title, with the line under it (a date, a byline) when there is one. */
export function ArticleTitle({ title, meta }: { title: string; meta?: string }) {
  return (
    <View className="gap-2">
      <Text variant="display" accessibilityRole="header">
        {title}
      </Text>
      {meta ? <Text variant="caption">{meta}</Text> : null}
    </View>
  );
}

/**
 * The merchant's HTML, drawn natively. A link opens as any link to the store
 * does: a screen of the app when it has one, else the page inside the app.
 */
export function ArticleBody({ html }: { html: string }) {
  const openLink = useOpenLink();
  return <RichText html={html} onLinkPress={openLink} />;
}
