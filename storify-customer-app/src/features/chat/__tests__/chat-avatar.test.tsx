import { render, screen } from '@testing-library/react-native';

import type { ImageSet } from '@/contracts/mobile/shop/v1';

import { ChatAvatar } from '../chat-avatar';
import { pictureUris } from './pictures';

const LOGO: ImageSet = {
  thumb: 'https://img.example.com/logo-thumb.png',
  card: 'https://img.example.com/logo-card.png',
  full: 'https://img.example.com/logo-full.png',
};

describe('the avatar of a conversation', () => {
  it('shows the picture it is given, and no letter beside it', async () => {
    await render(<ChatAvatar name="Pixel Forge Computing" image={LOGO} brand size="md" />);

    expect(pictureUris()).toEqual([LOGO.thumb]);
    expect(screen.queryByText('P')).toBeNull();
  });

  it('shows the first letter of the name when there is no picture', async () => {
    await render(<ChatAvatar name="Pixel Forge Computing" brand size="md" />);

    expect(pictureUris()).toEqual([]);
    expect(screen.getByText('P')).toBeTruthy();
  });
});
