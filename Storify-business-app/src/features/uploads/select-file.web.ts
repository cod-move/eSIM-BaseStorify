import type { UploadLimits } from './selected-file';

import { fitPhoto, needsFitting } from './fit-photo';
import { pickUploadAsset, type PickOptions, type UploadFileSource } from './pick-asset';
import { selectedUploadFile, UploadSelectionError } from './selected-file';

/** The bytes a base64 text stands for. */
function decodedLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function blobOf(base64: string, type: string): Blob {
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index++) bytes[index] = text.charCodeAt(index);
  return new Blob([bytes], { type });
}

/**
 * The browser preview's selection. A photo the store would refuse as it is
 * is redrawn to fit first (`fitPhoto`), its bytes kept, as there is no file
 * to read them back from.
 */
export async function selectUploadFile(
  source: UploadFileSource,
  policy: UploadLimits,
  options?: PickOptions
) {
  const asset = await pickUploadAsset(source, policy, options);
  if (!asset) return null;
  // Web pickers return the File itself. Never fetch a local/data URL separately.
  if (!asset.file) throw new UploadSelectionError('unreadableFile');
  const filename = asset.filename || asset.file.name;
  const mimeType = asset.mimeType || asset.file.type;

  if (needsFitting(mimeType, asset.file.size, policy)) {
    const fitted = await fitPhoto(
      { uri: asset.uri, filename, mimeType, width: asset.width, height: asset.height },
      policy,
      { base64: true, measure: (saved) => (saved.base64 ? decodedLength(saved.base64) : Infinity) }
    ).catch(() => null);
    if (fitted?.base64) {
      return selectedUploadFile(
        blobOf(fitted.base64, fitted.mimeType),
        fitted.filename,
        policy,
        fitted.mimeType,
        fitted.uri
      );
    }
  }
  return selectedUploadFile(asset.file, filename, policy, mimeType, asset.uri);
}
