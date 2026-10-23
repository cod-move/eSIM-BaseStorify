import { fireEvent, render, screen } from '@testing-library/react-native';
import 'react-native-gesture-handler/jestSetup';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { IntlProvider } from 'use-intl';

import type { ImageSet } from '@/contracts/mobile/shop/v1';
import { getMessages } from '@/i18n/messages';

import { ImageViewer } from '../image-viewer';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const photo = (name: string): ImageSet => ({
  thumb: `https://img.example.com/${name}-64.webp`,
  card: `https://img.example.com/${name}-320.webp`,
  full: `https://img.example.com/${name}-1080.webp`,
  alt: `Photo ${name}`,
});

const IMAGES = [photo('a'), photo('b'), photo('c')];

async function show(props: Partial<React.ComponentProps<typeof ImageViewer>> = {}) {
  const onClose = jest.fn();
  await render(
    <ImageViewer
      images={IMAGES}
      visible
      onClose={onClose}
      closeLabel="Close"
      positionLabel={(current, total) => `Image ${current} of ${total}`}
      {...props}
    />,
    {
      wrapper: ({ children }) => (
        <SafeAreaProvider initialMetrics={METRICS}>
          <IntlProvider locale="en" messages={getMessages('en')}>
            {children}
          </IntlProvider>
        </SafeAreaProvider>
      ),
    }
  );
  return onClose;
}

describe('ImageViewer', () => {
  afterEach(() => jest.restoreAllMocks());

  it('shows the first picture, with its description, and where it is in the row', async () => {
    await show();

    expect(screen.getByLabelText('Photo a')).toBeOnTheScreen();
    expect(screen.getByLabelText('Image 1 of 3')).toBeOnTheScreen();
  });

  it('opens at the picture asked for', async () => {
    await show({ initialIndex: 2 });
    expect(screen.getByLabelText('Image 3 of 3')).toBeOnTheScreen();
  });

  it.each([
    [-4, 'Image 1 of 3'],
    [9, 'Image 3 of 3'],
  ])('starts at picture %i as %s', async (initialIndex, label) => {
    await show({ initialIndex });
    expect(screen.getByLabelText(label)).toBeOnTheScreen();
  });

  it('follows the swipe: the position says which picture is on show', async () => {
    await show();

    await fireEvent(screen.getByTestId('image-viewer-row'), 'viewableItemsChanged', {
      viewableItems: [{ index: 1 }],
    });

    expect(screen.getByLabelText('Image 2 of 3')).toBeOnTheScreen();
  });

  it('says what the caller says, so that the words come from the caller’s messages', async () => {
    await show({
      closeLabel: 'إغلاق',
      positionLabel: (current, total) => `الصورة ${current} من ${total}`,
    });

    expect(screen.getByRole('button', { name: 'إغلاق' })).toBeOnTheScreen();
    expect(screen.getByLabelText('الصورة 1 من 3')).toBeOnTheScreen();
  });

  it('closes from its close button, which a screen reader can find', async () => {
    const onClose = await show();

    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the platform asks it to (the Android back button)', async () => {
    const onClose = await show();

    await fireEvent(screen.getByTestId('image-viewer'), 'requestClose');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has no position to show for a single picture', async () => {
    await show({ images: [photo('only')] });

    expect(screen.getByLabelText('Photo only')).toBeOnTheScreen();
    expect(screen.queryByLabelText(/Image \d of/)).toBeNull();
  });

  it('says its labels from the shared messages when the caller gives none', async () => {
    await show({ closeLabel: undefined, positionLabel: undefined });

    expect(screen.getByRole('button', { name: 'Close picture' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Picture 1 of 3')).toBeOnTheScreen();
    expect(screen.getByText('1 / 3')).toBeOnTheScreen();
  });

  it('draws nothing while closed, and nothing without pictures', async () => {
    await show({ visible: false });
    expect(screen.queryByLabelText('Photo a')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('draws nothing without pictures', async () => {
    await show({ images: [] });
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it.each(['ios', 'android'] as const)('has the same zoomable pictures on %s', async (os) => {
    jest.replaceProperty(Platform, 'OS', os);
    await show();

    expect(screen.getAllByTestId('image-viewer-zoom').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Photo a')).toBeOnTheScreen();
  });
});
