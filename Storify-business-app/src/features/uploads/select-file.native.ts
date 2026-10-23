import { File } from 'expo-file-system';

import type { UploadLimits } from './selected-file';

import { fitPhoto, needsFitting } from './fit-photo';
import { pickUploadAsset, type PickOptions, type UploadFileSource } from './pick-asset';
import { selectedUploadFile, UploadSelectionError } from './selected-file';

/**
 * SDK 57 File implements Blob; no React Native URI object is cast into FormData.
 * A photo the store would refuse as it is (a camera's, larger than the store
 * takes) is redrawn to fit first (`fitPhoto`), and shown from the new file.
 * A photo the phone cannot redraw goes as it is, for the limits to judge.
 */
export async function selectUploadFile(
  source: UploadFileSource,
  policy: UploadLimits,
  options?: PickOptions
) {
  const asset = await pickUploadAsset(source, policy, options);
  if (!asset) return null;
  try {
    const original = new File(asset.uri);
    if (!original.exists) throw new UploadSelectionError('unreadableFile');
    const filename = asset.filename || original.name;
    const mimeType = asset.mimeType || original.type;

    if (needsFitting(mimeType, original.size, policy)) {
      const fitted = await fitPhoto(
        { uri: asset.uri, filename, mimeType, width: asset.width, height: asset.height },
        policy,
        { measure: (saved) => new File(saved.uri).size }
      ).catch(() => null);
      if (fitted) {
        return selectedUploadFile(
          new File(fitted.uri),
          fitted.filename,
          policy,
          fitted.mimeType,
          fitted.uri
        );
      }
    }
    return selectedUploadFile(original, filename, policy, mimeType, asset.uri);
  } catch (error) {
    if (error instanceof UploadSelectionError) throw error;
    throw new UploadSelectionError('unreadableFile');
  }
}
