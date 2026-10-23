import * as Crypto from 'expo-crypto';

import type { UploadPolicy } from '@/contracts/mobile/biz/v1';

/**
 * What a file must be: no larger than `maxBytes`, of one of `mimeTypes` (any
 * when empty). An upload purpose's policy is one; a conversation's channel gives another.
 */
export type UploadLimits = Pick<UploadPolicy, 'maxBytes' | 'mimeTypes'>;

/** Client selection identity stays stable through retries, even for equal filenames. */
export type SelectedUploadFile = Readonly<{
  selectionId: string;
  filename: string;
  blob: Blob;
  size: number;
  mimeType: string;
  /** Where the picker left it on the device, to show it before it is sent. */
  previewUri?: string;
}>;

export type UploadSelectionReason =
  'cameraPermission' | 'unreadableFile' | 'tooLarge' | 'unsupportedType';

export class UploadSelectionError extends Error {
  constructor(readonly reason: UploadSelectionReason) {
    super(reason);
    this.name = 'UploadSelectionError';
  }
}

/** Picker filters help selection; the server policy and server validation remain authoritative. */
export function matchesUploadMime(mimeType: string, allowed: readonly string[]): boolean {
  return (
    allowed.length === 0 ||
    allowed.some((mime) =>
      mime === '*/*'
        ? true
        : mime.endsWith('/*')
          ? mimeType.startsWith(mime.slice(0, -1))
          : mimeType === mime
    )
  );
}

export function selectedUploadFile(
  file: Blob,
  filename: string,
  policy: UploadLimits,
  mimeType = file.type,
  previewUri?: string
): SelectedUploadFile {
  if (!filename || !Number.isFinite(file.size) || file.size <= 0) {
    throw new UploadSelectionError('unreadableFile');
  }
  if (file.size > policy.maxBytes) throw new UploadSelectionError('tooLarge');
  const type = (mimeType.split(';')[0] ?? '').trim().toLowerCase() || 'application/octet-stream';
  if (!matchesUploadMime(type, policy.mimeTypes)) throw new UploadSelectionError('unsupportedType');
  // Use a real Blob when the picker supplies a MIME type absent from its File.
  const blob = file.type === type ? file : file.slice(0, file.size, type);
  return Object.freeze({
    selectionId: Crypto.randomUUID(),
    filename,
    blob,
    size: blob.size,
    mimeType: blob.type,
    ...(previewUri ? { previewUri } : {}),
  });
}
