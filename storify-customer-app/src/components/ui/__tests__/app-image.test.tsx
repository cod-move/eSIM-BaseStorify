import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import { AppImage } from '../app-image';

const URL = 'https://img.example.com/me.jpg';
const LOADED = {
  cacheType: 'none',
  source: { url: URL, width: 400, height: 200, mediaType: 'image/jpeg' },
};

/** The frame is the root view; the picture is what it holds. */
function frame() {
  if (!screen.root) throw new Error('nothing rendered');
  return screen.root;
}
function picture() {
  const [child] = frame().children;
  if (typeof child === 'string' || !child) throw new Error('no picture in the frame');
  return child;
}
const frameRatio = () => StyleSheet.flatten(frame().props.style)?.aspectRatio;

describe('AppImage', () => {
  afterEach(() => jest.restoreAllMocks());

  it('takes a plain URL on the web, sends no headers and keeps the picture’s own ratio', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    await render(<AppImage image={URL} size="thumb" className="w-20" />);

    expect(picture().props.source).toEqual([{ uri: URL, headers: undefined }]);
    expect(frameRatio()).toBeUndefined();

    await fireEvent(picture(), 'load', { nativeEvent: { ...LOADED } });
    expect(frameRatio()).toBe(2);
  });

  it('leaves a frame with a width and a height as it is, so a round avatar stays a circle', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await render(<AppImage image={URL} size="thumb" className="size-14 rounded-full" />);

    await fireEvent(picture(), 'load', { nativeEvent: { ...LOADED } });
    expect(frameRatio()).toBeUndefined();
  });

  it('leaves a frame pinned to its parent’s edges filling it, so a slide’s picture is not a strip', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    await render(<AppImage image={URL} size="full" className="absolute inset-0" />);

    await fireEvent(picture(), 'load', { nativeEvent: { ...LOADED } });
    expect(frameRatio()).toBeUndefined();
  });

  it('asks for WebP off the web, and keeps the ratio the caller gives', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await render(<AppImage image={URL} size="thumb" aspectRatio={1} />);

    expect(picture().props.source[0].headers.Accept).toContain('image/webp');
    await fireEvent(picture(), 'load', { nativeEvent: { ...LOADED } });
    expect(frameRatio()).toBe(1);
  });
});
