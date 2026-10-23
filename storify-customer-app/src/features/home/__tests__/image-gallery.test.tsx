import { fireEvent, render, screen } from '@testing-library/react-native';
import 'react-native-gesture-handler/jestSetup';
import type { PropsWithChildren } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { IntlProvider } from 'use-intl';

import { imageGalleryBlock } from '@/api/mocks/fixtures/home-content-blocks';
import { getMessages } from '@/i18n/messages';

import { ImageGallery } from '../blocks/image-gallery';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function InEnglish({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <IntlProvider locale="en" messages={getMessages('en')}>
        {children}
      </IntlProvider>
    </SafeAreaProvider>
  );
}

describe('ImageGallery', () => {
  it('draws its title and a picture that opens the viewer', async () => {
    await render(<ImageGallery block={imageGalleryBlock} />, { wrapper: InEnglish });

    expect(screen.getByText('From our community')).toBeTruthy();
    expect(screen.queryByTestId('image-viewer')).toBeNull();

    await fireEvent.press(screen.getByRole('imagebutton', { name: 'Open picture 2 of 4' }));

    expect(screen.getByTestId('image-viewer')).toBeTruthy();
  });
});
