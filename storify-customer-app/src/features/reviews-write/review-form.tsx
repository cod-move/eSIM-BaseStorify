import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { isApiError } from '@/api/errors';
import { AppImage } from '@/components/ui/app-image';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import type { ImageSet, MyReview, ReviewLimits } from '@/contracts/mobile/shop/v1';
import { useErrorMessage } from '@/i18n/use-error-message';

import { draftOf, photoKey, problemsOf, type ReviewDraft } from './review-draft';
import { usePhotoPicker } from './use-photo-picker';

/** Refusals the store words for the shopper: its sentence is printed as it is. */
const STORE_WORDED = new Set([
  'NOT_REVIEWABLE',
  'ALREADY_REVIEWED',
  'UPLOAD_TOO_LARGE',
  'UPLOAD_TYPE_NOT_ALLOWED',
]);

const STARS = [1, 2, 3, 4, 5];

type ReviewFormProps = {
  product: { name: string; image?: ImageSet };
  /** The store's limits: every check is against these. */
  limits: ReviewLimits;
  /** The review being changed: the form opens filled in with it. */
  review?: MyReview;
  pending: boolean;
  /** Why the last sending failed. */
  error: unknown;
  onSubmit: (draft: ReviewDraft) => void;
};

/**
 * Writing or changing a review: the product row, five stars, a title, the
 * text with its counter, the photos, and Submit with the store's word on when
 * the review will show. It checks the draft against the store's limits and
 * sends nothing else; what to do with it is the caller's.
 */
export function ReviewForm({ product, limits, review, pending, error, onSubmit }: ReviewFormProps) {
  const t = useTranslations('reviewWrite');
  const describe = useErrorMessage();
  const [draft, setDraft] = useState(() => draftOf(review));
  const [checked, setChecked] = useState(false);
  const change = (patch: Partial<ReviewDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const room = limits.maxPhotos - draft.photos.length;
  const picker = usePhotoPicker(limits.photo, (files) =>
    setDraft((current) => ({
      ...current,
      photos: [
        ...current.photos,
        ...files
          .filter((file) => !current.photos.some((photo) => photoKey(photo) === file.uri))
          .map((file) => ({ kind: 'picked' as const, file })),
      ].slice(0, limits.maxPhotos),
    }))
  );

  const problems = checked ? problemsOf(draft, limits) : {};
  const textError =
    problems.text === 'short'
      ? t('textShort', { min: limits.textMinLength })
      : problems.text === 'long'
        ? t('textLong', { max: limits.textMaxLength })
        : undefined;
  const pickProblem = picker.problem
    ? { type: t('photoType'), size: t('photoSize'), camera: t('cameraDenied') }[picker.problem]
    : undefined;
  const refusal =
    error === null || error === undefined
      ? undefined
      : isApiError(error) && error.reason && STORE_WORDED.has(error.reason) && error.message
        ? error.message
        : describe(error);

  const submit = () => {
    setChecked(true);
    if (Object.keys(problemsOf(draft, limits)).length === 0) onSubmit(draft);
  };

  return (
    <View className="gap-5">
      <View className="flex-row items-center gap-3">
        <AppImage image={product.image} size="thumb" className="size-14 rounded-md" decorative />
        <Text variant="label" className="flex-1" numberOfLines={2}>
          {product.name}
        </Text>
      </View>

      <View className="gap-2">
        <Text variant="label">{t('ratingLabel')}</Text>
        <View className="flex-row gap-1" accessibilityRole="radiogroup">
          {STARS.map((star) => (
            <Pressable
              key={star}
              accessibilityRole="radio"
              accessibilityLabel={t('star', { count: star })}
              accessibilityState={{ checked: draft.rating === star }}
              onPress={() => change({ rating: star })}
              className="size-11 items-center justify-center">
              <Icon
                name="star"
                size={34}
                filled={star <= draft.rating}
                colorClassName={star <= draft.rating ? 'accent-rating' : 'accent-muted'}
              />
            </Pressable>
          ))}
        </View>
        {problems.rating ? (
          <Text variant="caption" className="text-danger">
            {t('ratingMissing')}
          </Text>
        ) : null}
      </View>

      <TextField
        label={t('titleLabel')}
        optional
        value={draft.title}
        onChangeText={(title) => change({ title })}
        maxLength={limits.titleMaxLength}
        error={problems.title ? t('titleLong', { max: limits.titleMaxLength }) : undefined}
      />

      <TextField
        label={t('textLabel')}
        value={draft.text}
        onChangeText={(text) => change({ text })}
        placeholder={t('textPlaceholder')}
        multiline
        textAlignVertical="top"
        inputClassName="min-h-28"
        maxLength={limits.textMaxLength}
        error={textError}
        hint={t('counter', { count: draft.text.length, max: limits.textMaxLength })}
      />

      <View className="gap-2">
        <Text variant="label">{t('photosLabel')}</Text>
        <Text variant="caption">{t('photosHint', { max: limits.maxPhotos })}</Text>
        {draft.photos.length > 0 ? (
          <View className="flex-row flex-wrap gap-3 pt-2">
            {draft.photos.map((photo, index) => (
              <View key={photoKey(photo)} className="size-20">
                <AppImage
                  image={photo.kind === 'kept' ? photo.photo.image : photo.file.uri}
                  size="thumb"
                  className="size-20 rounded-md"
                  decorative
                />
                <IconButton
                  icon="close"
                  variant="floating"
                  label={t('removePhoto', { index: index + 1 })}
                  className="absolute -end-2 -top-2"
                  onPress={() =>
                    change({ photos: draft.photos.filter((other) => other !== photo) })
                  }
                />
              </View>
            ))}
          </View>
        ) : null}
        {room > 0 ? (
          <View className="flex-row flex-wrap gap-3">
            <Button
              label={t('addPhotos')}
              icon="image-add"
              variant="outline"
              size="sm"
              onPress={() => void picker.fromLibrary(room)}
            />
            <Button
              label={t('takePhoto')}
              icon="camera"
              variant="outline"
              size="sm"
              onPress={() => void picker.fromCamera()}
            />
          </View>
        ) : null}
        {pickProblem || problems.photos ? (
          <Text variant="caption" className="text-danger">
            {pickProblem ?? t('photosTooMany', { max: limits.maxPhotos })}
          </Text>
        ) : null}
      </View>

      <View className="gap-3">
        {refusal ? (
          <Text className="text-danger" accessibilityLiveRegion="polite">
            {refusal}
          </Text>
        ) : null}
        <Text variant="caption">{limits.publicationMessage}</Text>
        <Button label={t('submit')} variant="accent" loading={pending} onPress={submit} />
      </View>
    </View>
  );
}
