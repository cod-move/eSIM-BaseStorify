import { File as NativeFile } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import type { UploadPolicy } from '@/contracts/mobile/biz/v1';

import { needsFitting } from '../fit-photo';
import { selectUploadFile as nativeSelect } from '../select-file.native';
import { selectUploadFile as webSelect } from '../select-file.web';
import { selectedUploadFile, UploadSelectionError } from '../selected-file';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  PermissionStatus: { DENIED: 'denied' },
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
/** How many bytes a file the test made takes, by its address; any other reads "native-bytes". */
const mockFileSizes = new Map<string, number>();
jest.mock('expo-file-system', () => ({
  File: jest.fn((uri: string) => {
    const size = mockFileSizes.get(uri);
    return Object.assign(
      new Blob([size === undefined ? 'native-bytes' : 'x'.repeat(size)], { type: 'image/jpeg' }),
      { name: 'native.jpg', exists: true }
    );
  }),
}));
// Each rendition is saved to its own file, numbered in turn: `file:///cache/redrawn-1.jpg`.
jest.mock('expo-image-manipulator', () => {
  let saved = 0;
  const context: { resize: jest.Mock; renderAsync: jest.Mock } = {
    resize: jest.fn(() => context),
    renderAsync: jest.fn(async () => ({
      width: 4000,
      height: 3000,
      saveAsync: jest.fn(async (options: { format: string }) => ({
        uri: `file:///cache/redrawn-${++saved}.${options.format === 'webp' ? 'webp' : 'jpg'}`,
        width: 0,
        height: 0,
      })),
    })),
  };
  return {
    SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
    ImageManipulator: { manipulate: jest.fn(() => context) },
    resetSaved: () => {
      saved = 0;
    },
  };
});

beforeEach(() => {
  mockFileSizes.clear();
  jest.requireMock<{ resetSaved: () => void }>('expo-image-manipulator').resetSaved();
});

const policy: UploadPolicy = {
  purpose: 'product_media',
  maxBytes: 100,
  maxFiles: 1,
  mimeTypes: ['image/jpeg'],
};

describe('actual file selection', () => {
  it('copies native documents to cache and supplies an actual Blob/File', async () => {
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({
      canceled: false,
      assets: [
        {
          name: 'picked.jpg',
          uri: 'file:///cache/picked.jpg',
          mimeType: 'image/jpeg',
          lastModified: 0,
        },
      ],
    });
    const file = await nativeSelect('document', policy);
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        copyToCacheDirectory: true,
        base64: false,
        multiple: false,
        type: ['image/jpeg'],
      })
    );
    expect(NativeFile).toHaveBeenCalledWith('file:///cache/picked.jpg');
    expect(file?.blob).toBeInstanceOf(Blob);
    expect(await file?.blob.text()).toBe('native-bytes');
    expect(file?.filename).toBe('picked.jpg');
  });

  it('uses the browser picker File directly rather than fetching/casting its URI', async () => {
    const body = new FormData();
    body.append('file', new Blob(['web-bytes'], { type: 'image/jpeg' }), 'web.jpg');
    const picked = body.get('file');
    if (!picked || typeof picked === 'string') throw new Error('Missing browser File');
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({
      canceled: false,
      assets: [{ name: picked.name, uri: 'blob:local-selection', file: picked, lastModified: 0 }],
    });
    const file = await webSelect('document', policy);
    expect(file?.blob).toBe(picked);
    expect(await file?.blob.text()).toBe('web-bytes');
  });

  it('treats picker cancellation as no file and does not request photo-library access', async () => {
    jest
      .mocked(DocumentPicker.getDocumentAsync)
      .mockResolvedValue({ canceled: true, assets: null });
    expect(await nativeSelect('document', policy)).toBeNull();
    jest
      .mocked(ImagePicker.launchImageLibraryAsync)
      .mockResolvedValue({ canceled: true, assets: null });
    expect(await nativeSelect('photo-library', policy)).toBeNull();
    expect(ImagePicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
  });

  it('requires camera permission and reports refusal without opening the camera', async () => {
    jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({
      granted: false,
      canAskAgain: true,
      expires: 'never',
      status: ImagePicker.PermissionStatus.DENIED,
    });
    await expect(nativeSelect('camera', policy)).rejects.toMatchObject({
      reason: 'cameraPermission',
    });
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('checks the supplied server policy and gives every selection its own retry identity', () => {
    const blob = new Blob(['same'], { type: 'image/jpeg' });
    const first = selectedUploadFile(blob, 'same.jpg', policy);
    const second = selectedUploadFile(blob, 'same.jpg', policy);
    expect(first.selectionId).not.toBe(second.selectionId);
    expect(() => selectedUploadFile(blob, 'same.jpg', { ...policy, maxBytes: 1 })).toThrow(
      UploadSelectionError
    );
    expect(() =>
      selectedUploadFile(blob, 'same.jpg', { ...policy, mimeTypes: ['application/pdf'] })
    ).toThrow(UploadSelectionError);
    expect(
      selectedUploadFile(new Blob(['data']), 'file.bin', { ...policy, mimeTypes: [] }).blob.type
    ).toBe('application/octet-stream');
  });
});

/** A camera's photo, `size` bytes as taken. */
function takePhoto(size: number, { mimeType = 'image/jpeg', name = 'IMG_0001.JPG' } = {}) {
  const uri = `file:///camera/${name}`;
  mockFileSizes.set(uri, size);
  jest.mocked(ImagePicker.requestCameraPermissionsAsync).mockResolvedValue({
    granted: true,
    canAskAgain: true,
    expires: 'never',
    status: 'granted' as ImagePicker.PermissionStatus,
  });
  jest.mocked(ImagePicker.launchCameraAsync).mockResolvedValue({
    canceled: false,
    assets: [{ uri, fileName: name, mimeType, width: 4000, height: 3000 }],
  });
}

describe('a photo larger than the store takes', () => {
  const context = () =>
    jest.mocked(ImageManipulator.manipulate).mock.results[0]?.value as {
      resize: jest.Mock;
      renderAsync: jest.Mock;
    };

  it('is redrawn smaller, step by step, until it fits, and shown from the new file', async () => {
    takePhoto(500);
    // The first rendition is still too large; the second fits.
    mockFileSizes.set('file:///cache/redrawn-1.jpg', 300);
    mockFileSizes.set('file:///cache/redrawn-2.jpg', 80);

    const file = await nativeSelect('camera', policy);

    expect(file).toMatchObject({
      filename: 'IMG_0001.jpg',
      mimeType: 'image/jpeg',
      size: 80,
      previewUri: 'file:///cache/redrawn-2.jpg',
    });
    expect(context().resize.mock.calls).toEqual([[{ width: 2560 }], [{ width: 2048 }]]);
  });

  it('is left as it is when it fits', async () => {
    takePhoto(90);
    const file = await nativeSelect('camera', policy);
    expect(file).toMatchObject({ size: 90, previewUri: 'file:///camera/IMG_0001.JPG' });
    expect(ImageManipulator.manipulate).not.toHaveBeenCalled();
  });

  it('is redrawn as JPEG when the store does not take its format (an iPhone’s HEIC)', async () => {
    takePhoto(50, { mimeType: 'image/heic', name: 'IMG_0002.HEIC' });
    mockFileSizes.set('file:///cache/redrawn-1.jpg', 40);
    const file = await nativeSelect('camera', policy);
    expect(file).toMatchObject({ filename: 'IMG_0002.jpg', mimeType: 'image/jpeg', size: 40 });
  });

  it('says it is too large when even the smallest rendition does not fit', async () => {
    takePhoto(500);
    for (let step = 1; step <= 5; step++)
      mockFileSizes.set(`file:///cache/redrawn-${step}.jpg`, 300);
    await expect(nativeSelect('camera', policy)).rejects.toMatchObject({ reason: 'tooLarge' });
    expect(context().renderAsync).toHaveBeenCalledTimes(5);
  });

  it('is redrawn only when it is a photo the phone can redraw', () => {
    const limits = { maxBytes: 100, mimeTypes: ['image/jpeg', 'image/png', 'image/gif'] };
    expect(needsFitting('image/jpeg', 101, limits)).toBe(true);
    expect(needsFitting('image/png', 101, limits)).toBe(true);
    expect(needsFitting('image/heic', 10, limits)).toBe(true);
    expect(needsFitting('image/jpeg', 100, limits)).toBe(false);
    // A GIF would lose its motion, a PDF is no photo.
    expect(needsFitting('image/gif', 101, limits)).toBe(false);
    expect(needsFitting('application/pdf', 101, limits)).toBe(false);
  });
});
