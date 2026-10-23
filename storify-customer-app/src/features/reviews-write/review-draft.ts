import type { ImagePickerAsset } from 'expo-image-picker';

import type { FormFile } from '@/api/transport';
import type {
  CreateReviewRequest,
  MyReview,
  ReviewLimits,
  ReviewPhoto,
  UploadPolicy,
} from '@/contracts/mobile/shop/v1';

/**
 * A photo of the review being written: one already on the review (kept when
 * it is edited), or one picked on the phone and not sent yet.
 */
export type DraftPhoto = { kind: 'kept'; photo: ReviewPhoto } | { kind: 'picked'; file: FormFile };

export type ReviewDraft = {
  /** 0 until the shopper taps a star. */
  rating: number;
  title: string;
  text: string;
  photos: DraftPhoto[];
};

/** A new review is empty; an edited one starts as it was. */
export function draftOf(review?: MyReview): ReviewDraft {
  return {
    rating: review?.rating ?? 0,
    title: review?.title ?? '',
    text: review?.text ?? '',
    photos: (review?.photos ?? []).map((photo) => ({ kind: 'kept', photo })),
  };
}

export function photoKey(photo: DraftPhoto): string {
  return photo.kind === 'kept' ? photo.photo.id : photo.file.uri;
}

/** What is wrong with a draft, field by field, against the store's limits. Empty when it may be sent. */
export type DraftProblems = {
  rating?: true;
  title?: true;
  text?: 'short' | 'long';
  photos?: true;
};

export function problemsOf(draft: ReviewDraft, limits: ReviewLimits): DraftProblems {
  const problems: DraftProblems = {};
  const text = draft.text.trim();
  if (draft.rating < 1 || draft.rating > 5) problems.rating = true;
  if (draft.title.trim().length > limits.titleMaxLength) problems.title = true;
  if (text.length < limits.textMinLength) problems.text = 'short';
  else if (text.length > limits.textMaxLength) problems.text = 'long';
  if (draft.photos.length > limits.maxPhotos) problems.photos = true;
  return problems;
}

/** The new review as the store takes it, its photos named by their upload ids. */
export function requestOf(draft: ReviewDraft, uploadIds: string[]): CreateReviewRequest {
  const title = draft.title.trim();
  return {
    rating: draft.rating,
    title: title === '' ? undefined : title,
    text: draft.text.trim(),
    uploadIds: uploadIds.length > 0 ? uploadIds : undefined,
  };
}

/**
 * A picked photo as a form sends it, or why the store would refuse it: a type
 * it does not take, or more bytes than it allows. A photo whose size the
 * phone does not tell is sent, and the store judges it.
 */
export function pickedPhoto(
  asset: ImagePickerAsset,
  policy: UploadPolicy
): { file: FormFile } | { refused: 'type' | 'size' } {
  const type = asset.mimeType;
  if (!type || !policy.allowedTypes.includes(type)) return { refused: 'type' };
  if (asset.fileSize !== undefined && asset.fileSize > policy.maxBytes) return { refused: 'size' };
  const name = asset.fileName ?? `photo.${type.slice(type.indexOf('/') + 1)}`;
  return { file: { uri: asset.uri, name, type } };
}
