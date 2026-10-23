import { getDocumentAsync } from 'expo-document-picker';
import {
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
  type ImagePickerResult,
} from 'expo-image-picker';

import type { FormFile } from '@/api/transport';
import type { AttachmentPolicy, ChatMessageProduct, ProductCard } from '@/contracts/mobile/shop/v1';

/** What the shopper adds to a message before sending it: a product to share, or a file. */
export type MessageAttachment =
  { kind: 'product'; product: ChatMessageProduct } | { kind: 'file'; file: FormFile };

/** A message on its way to the store, shown at once. */
export type PendingMessage = { body: string; attachment?: MessageAttachment };

/** Why a picked file was not attached: the conversation does not take it, or the camera is not allowed. */
export type PickProblem = 'type' | 'size' | 'camera';

export type PickResult = { attachment: MessageAttachment } | { problem: PickProblem } | null;

/** A phone photo is many megabytes: compressed this much it still shows every detail. */
const QUALITY = 0.7;

export function isImageFile(file: FormFile): boolean {
  return file.type.startsWith('image/');
}

/** The conversation takes pictures: the photo choices are offered. */
export function takesImages(policy: AttachmentPolicy | undefined): boolean {
  return policy?.types.some((type) => type.mimeType.startsWith('image/')) ?? false;
}

/**
 * A picked file as the form sends it, or why the store would refuse it: a
 * type the conversation does not take, or more bytes than it allows. A file
 * whose size the phone does not tell is sent, and the store judges it.
 */
export function checkedFile(
  picked: { uri: string; name: string; mimeType?: string | null; size?: number | null },
  policy: AttachmentPolicy
): PickResult {
  const type = picked.mimeType ?? '';
  const accepted = policy.types.find((candidate) => candidate.mimeType === type);
  if (!accepted) return { problem: 'type' };
  if (typeof picked.size === 'number' && picked.size > accepted.maxBytes) {
    return { problem: 'size' };
  }
  return { attachment: { kind: 'file', file: { uri: picked.uri, name: picked.name, type } } };
}

/** A product of the catalog as a message shares it: its card, without what a card alone needs. */
export function sharedProductOf(card: ProductCard): ChatMessageProduct {
  return {
    id: card.id,
    slug: card.slug,
    name: card.name,
    ...(card.image ? { image: card.image } : {}),
    ...(card.price ? { price: card.price } : {}),
    ...(card.compareAtPrice ? { compareAtPrice: card.compareAtPrice } : {}),
  };
}

function photoOf(result: ImagePickerResult, policy: AttachmentPolicy): PickResult {
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  const type = asset.mimeType ?? '';
  return checkedFile(
    {
      uri: asset.uri,
      name: asset.fileName ?? `photo.${type.slice(type.indexOf('/') + 1) || 'jpg'}`,
      mimeType: asset.mimeType,
      size: asset.fileSize,
    },
    policy
  );
}

/** One photo from the library. Null when the shopper chose none. */
export async function pickPhoto(policy: AttachmentPolicy): Promise<PickResult> {
  const result = await launchImageLibraryAsync({ mediaTypes: 'images', quality: QUALITY });
  return photoOf(result, policy);
}

/** A photo taken now, once the camera is allowed. Null when the shopper took none. */
export async function takePhoto(policy: AttachmentPolicy): Promise<PickResult> {
  const permission = await requestCameraPermissionsAsync();
  if (!permission.granted) return { problem: 'camera' };
  const result = await launchCameraAsync({ mediaTypes: 'images', quality: QUALITY });
  return photoOf(result, policy);
}

/** One file of a type the conversation takes. Null when the shopper chose none. */
export async function pickDocument(policy: AttachmentPolicy): Promise<PickResult> {
  const result = await getDocumentAsync({
    type: policy.types.map((type) => type.mimeType),
    copyToCacheDirectory: true,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  return checkedFile(asset, policy);
}
