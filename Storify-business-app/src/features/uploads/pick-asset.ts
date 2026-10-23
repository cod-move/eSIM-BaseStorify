import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { UploadSelectionError, type UploadLimits } from './selected-file';

export type UploadFileSource = 'document' | 'photo-library' | 'camera';
type PickedAsset = {
  uri: string;
  filename?: string;
  mimeType?: string;
  file?: File;
  /** A photo's size in pixels, when the picker knows it (0 or absent when not). */
  width?: number;
  height?: number;
};

export type PickOptions = {
  /**
   * A photo cropped to a square by the operator, and compressed: a profile
   * picture. Only photos (the library or the camera) are cropped.
   */
  square?: boolean;
};

/** How much a cropped profile photo is compressed: small to send, sharp in a circle. */
const SQUARE_QUALITY = 0.8;

/** Must be invoked from the user's tap for browser picker access. */
export async function pickUploadAsset(
  source: UploadFileSource,
  policy: UploadLimits,
  { square = false }: PickOptions = {}
): Promise<PickedAsset | null> {
  if (source === 'document') {
    const result = await DocumentPicker.getDocumentAsync({
      type: policy.mimeTypes.length ? policy.mimeTypes : '*/*',
      copyToCacheDirectory: true,
      multiple: false,
      base64: false,
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    if (!asset) throw new UploadSelectionError('unreadableFile');
    return { uri: asset.uri, filename: asset.name, mimeType: asset.mimeType, file: asset.file };
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: square,
    // iOS crops to a square anyway; Android needs the ratio.
    ...(square ? { aspect: [1, 1] as [number, number] } : {}),
    quality: square ? SQUARE_QUALITY : 1,
    base64: false,
    exif: false,
  };
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new UploadSelectionError('cameraPermission');
  }
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) throw new UploadSelectionError('unreadableFile');
  return {
    uri: asset.uri,
    filename: asset.fileName ?? undefined,
    mimeType: asset.mimeType,
    file: asset.file,
    width: asset.width,
    height: asset.height,
  };
}
