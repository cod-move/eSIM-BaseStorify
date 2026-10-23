import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { AppHeader, HeaderButton, HeaderTitle } from '@/components/shell/app-header';
import { TabBarView, tabBarSpace } from '@/components/shell/tab-bar';
import { SearchField } from '@/components/ui/search-field';
import { Text } from '@/components/ui/text';
import { APP_LAYOUT, describeItem } from '@/config/app-layout';

import { GalleryItem, GalleryPage, GallerySection } from './gallery-kit';

const noop = () => {};

/** The shell of the app: the tab bar over scrolling content, and the header's variants. */
export function ShellGallery() {
  return (
    <GalleryPage>
      <GallerySection title="Tab bar">
        <GalleryItem label="Press a tab · content scrolls under the bar and fades · cart badge 3">
          <BarFrame cartCount={3} />
        </GalleryItem>
        <GalleryItem label="Cart badge hidden at 0, and 99+ over 99">
          <View className="gap-3">
            <BarFrame cartCount={0} height={120} initial={3} />
            <BarFrame cartCount={120} height={120} initial={3} />
          </View>
        </GalleryItem>
      </GallerySection>

      <GallerySection title="App header">
        <GalleryItem label="Plain · back at the start, title in the centre">
          <Framed>
            <AppHeader title="My Cart" onBack={noop} topInset={0} />
          </Framed>
        </GalleryItem>
        <GalleryItem label="With an icon before the title (Preferences, Security, Addresses)">
          <Framed>
            <AppHeader
              titleView={<HeaderTitle title="Preferences" icon="filter" />}
              onBack={noop}
              topInset={0}
            />
          </Framed>
        </GalleryItem>
        <GalleryItem label="Sheet-like · close at the end">
          <Framed>
            <AppHeader title="Filters" onClose={noop} topInset={0} />
          </Framed>
        </GalleryItem>
        <GalleryItem label="Action at the end">
          <Framed>
            <AppHeader
              title="Addresses"
              onBack={noop}
              trailing={<HeaderButton icon="heart" label="Wishlist" onPress={noop} />}
              topInset={0}
            />
          </Framed>
        </GalleryItem>
        <GalleryItem label="With search · the field takes the place of the title">
          <Framed>
            <AppHeader fill titleView={<SearchHeaderField />} onBack={noop} topInset={0} />
          </Framed>
        </GalleryItem>
        <GalleryItem label="Long title · wraps to two lines, keeps the centre">
          <Framed>
            <AppHeader
              title="Frequently asked questions about orders and returns"
              onBack={noop}
              topInset={0}
            />
          </Framed>
        </GalleryItem>
        <GalleryItem label="Transparent over a wash (Account, Profile, Chat)">
          <View className="overflow-hidden rounded-xl bg-surface-alt">
            <AppHeader title="Profile" onBack={noop} transparent topInset={0} />
          </View>
        </GalleryItem>
      </GallerySection>
    </GalleryPage>
  );
}

function Framed({ children }: { children: ReactNode }) {
  return <View className="overflow-hidden rounded-xl border border-border">{children}</View>;
}

function SearchHeaderField() {
  const [text, setText] = useState('');
  return <SearchField label="Search products" value={text} onChangeText={setText} />;
}

type BarFrameProps = {
  cartCount: number;
  height?: number;
  initial?: number;
};

/** A small screen with the real bar at its foot, over rows that scroll under it. */
function BarFrame({ cartCount, height = 420, initial = 0 }: BarFrameProps) {
  const t = useTranslations();
  const [active, setActive] = useState(initial);
  const items = APP_LAYOUT.tabs.map((item) => {
    const { icon, labelKey, label } = describeItem(item);
    return { icon, label: label ?? t(labelKey), badge: item.badge === 'cart' ? cartCount : 0 };
  });

  return (
    <View
      className="overflow-hidden rounded-xl border border-border bg-background"
      style={{ height }}>
      <ScrollView
        contentContainerClassName="gap-3 p-4"
        contentContainerStyle={{ paddingBottom: tabBarSpace(0) }}>
        {Array.from({ length: 8 }, (_, index) => (
          <View key={index} className="h-24 justify-center rounded-xl bg-primary px-4">
            <Text className="text-primary-foreground">{`Row ${index + 1}`}</Text>
          </View>
        ))}
      </ScrollView>
      <TabBarView items={items} active={active} bottomInset={0} onSelect={setActive} />
    </View>
  );
}
