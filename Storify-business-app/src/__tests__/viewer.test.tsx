import { act, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import './hooks';
import './preload-app';
import { currentPath, press, settle, signIn } from './screens';

async function openPicture(params: { url: string; title?: string }): Promise<void> {
  await act(async () => router.push({ pathname: '/viewer', params }));
  await settle();
}

/** A picture full screen, over the screen it was opened from. */
describe('the picture viewer', () => {
  it('shows the picture under its name, and closes back to where it was opened', async () => {
    await signIn();
    await openPicture({ url: 'https://picsum.photos/seed/vase-colour/640', title: 'colour.jpg' });

    expect(currentPath()).toBe('/viewer');
    expect(screen.getByRole('header', { name: 'colour.jpg' })).toBeVisible();
    expect(screen.getByLabelText('colour.jpg')).toBeVisible();

    await press('Close');
    await settle();
    expect(currentPath()).toBe('/');
  });

  it('calls a picture with no name a picture', async () => {
    await signIn();
    await openPicture({ url: 'https://picsum.photos/seed/vase-colour/640' });

    expect(screen.getByRole('header', { name: 'Picture' })).toBeVisible();
  });

  it('opens nothing but a web address', async () => {
    await signIn();
    await openPicture({ url: 'javascript:alert(1)' });

    expect(screen.getByText("This picture can't be opened")).toBeVisible();
    expect(screen.queryByLabelText('Picture')).toBeNull();
  });
});
