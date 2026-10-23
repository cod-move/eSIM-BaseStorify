import { fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import type { PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { IntlProvider } from 'use-intl';

import { getMessages } from '@/i18n/messages';

import { tabBarSpace, TabBarView, usePinnedPanelPadding } from '../tab-bar';

function Arabic({ children }: PropsWithChildren) {
  return (
    <IntlProvider locale="ar" messages={getMessages('ar')}>
      {children}
    </IntlProvider>
  );
}

const HOME = 'الرئيسية';

const layout = (width: number) => ({
  nativeEvent: { layout: { x: 0, y: 0, width, height: 16 } },
});

async function renderBarUnlaid() {
  await render(
    <TabBarView
      items={[
        { icon: 'home', label: HOME, badge: 0 },
        { icon: 'search', label: 'بحث', badge: 0 },
        { icon: 'cart', label: 'السلة', badge: 120 },
      ]}
      active={0}
      bottomInset={0}
      onSelect={() => {}}
    />,
    { wrapper: Arabic }
  );
}

async function renderBar() {
  await renderBarUnlaid();
  await fireEvent(screen.getByLabelText(getMessages('ar').shell.tabBar), 'layout', layout(343));
}

/** The copy of a label that is measured out of sight: the one that reports its layout. */
function measured(label: string) {
  const copy = screen
    .getAllByText(label, { includeHiddenElements: true })
    .find((element) => typeof element.props.onLayout === 'function');
  if (!copy) throw new Error(`no measured copy of ${label}`);
  return copy;
}

/** The width the visible label is given in the active pill. */
function visibleWidth(label: string): number {
  return Number(StyleSheet.flatten(screen.getByText(label).props.style).width);
}

describe('TabBarView', () => {
  it('gives every tab the same, non-zero width on the first frame, before any layout event', async () => {
    await renderBarUnlaid();

    const widths = screen
      .getAllByRole('tab')
      .map((tab) => Number(StyleSheet.flatten(tab.parent?.props.style).width));
    expect(widths).toHaveLength(3);
    for (const width of widths) {
      expect(width).toBeGreaterThan(0);
      expect(width).toBeCloseTo(widths[0] ?? 0, 5);
    }
  });

  it('measures a label again when it lays out wider, and gives it more than the whole pixels the web reports', async () => {
    await renderBar();
    await fireEvent(measured('بحث'), 'layout', layout(20));
    await fireEvent(measured('السلة'), 'layout', layout(28));

    // First measured before the text was shaped, then again at its full width: 47 px on the web, which rounds
    // the true width (up to 47.5) to the nearest pixel.
    await fireEvent(measured(HOME), 'layout', layout(30));
    await fireEvent(measured(HOME), 'layout', layout(47));

    expect(visibleWidth(HOME)).toBeGreaterThanOrEqual(47.5);
  });
});

/** A phone with a home indicator, `bottom` high, and the tab navigator around the screen or not. */
function padding({ bottom, inTabs }: { bottom: number; inTabs: boolean }) {
  const insets = { top: 47, left: 0, right: 0, bottom };
  const wrapper = ({ children }: PropsWithChildren) => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets }}>
      {inTabs ? (
        <BottomTabBarHeightContext.Provider value={0}>
          {children}
        </BottomTabBarHeightContext.Provider>
      ) : (
        children
      )}
    </SafeAreaProvider>
  );
  return renderHook(() => usePinnedPanelPadding(), { wrapper });
}

describe('usePinnedPanelPadding', () => {
  it('keeps a panel pinned over the bar clear of the whole bar, its fade included, by a small gap', async () => {
    for (const bottom of [0, 34]) {
      const { result } = await padding({ bottom, inTabs: true });
      const gap = result.current - tabBarSpace(bottom);
      expect(gap).toBeGreaterThanOrEqual(8);
      expect(gap).toBeLessThanOrEqual(12);
    }
  });

  it('keeps a panel on a screen with no bar clear of the home indicator', async () => {
    expect((await padding({ bottom: 34, inTabs: false })).result.current).toBe(34);
    expect((await padding({ bottom: 0, inTabs: false })).result.current).toBe(12);
  });
});
