import { useRef, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { useTranslations } from 'use-intl';

import { isNetworkError } from '@/api/errors';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { IconCircle } from '@/components/ui/icon-circle';
import { PressableScale } from '@/components/ui/press-motion';
import { GroupFootnote, NavRow, RowGroup } from '@/components/ui/rows';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { PICTURE_MAX_BYTES, PICTURE_TYPES } from '@/contracts/mobile/biz/v1';
import type { UploadFileSource } from '@/features/uploads/pick-asset';
import { selectUploadFile } from '@/features/uploads/select-file';
import type { UploadLimits } from '@/features/uploads/selected-file';
import { useUploadErrorMessage } from '@/features/uploads/use-upload-error-message';

import { useMyPicture, type PictureChange } from './use-my-picture';

/** What a profile photo may be: the contract's own limits; the store may refuse a smaller one still. */
const PICTURE_LIMITS: UploadLimits = { maxBytes: PICTURE_MAX_BYTES, mimeTypes: [...PICTURE_TYPES] };

type ProfilePictureProps = {
  name: string;
  imageUrl?: string;
};

/**
 * The operator's picture on their account page, in a
 * white ring with a camera badge: a tap opens a sheet to take a photo, choose
 * one (cropped to a square) or remove the picture. While it is sent the
 * picture dims under a spinner; the store's answer shows at once, here and on
 * the Account tab, and a toast says what happened.
 */
export function ProfilePicture({ name, imageUrl }: ProfilePictureProps) {
  const t = useTranslations('account.picture');
  const toast = useToast();
  const describe = useUploadErrorMessage();
  const change = useMyPicture();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  // The picker waits for the sheet to leave: iOS shows one modal at a time.
  const source = useRef<UploadFileSource | null>(null);
  const spinner = useCSSVariable('--color-on-scrim');
  const busy = picking || change.isPending;

  const failed = (error: unknown) =>
    toast.show({ message: describe(error), tone: isNetworkError(error) ? 'offline' : 'danger' });

  const send = async (next: PictureChange, done: string) => {
    try {
      await change.mutateAsync(next);
      toast.show({ message: done, tone: 'success' });
    } catch (error) {
      failed(error);
    }
  };

  const pick = async (from: UploadFileSource) => {
    setPicking(true);
    try {
      const photo = await selectUploadFile(from, PICTURE_LIMITS, { square: true });
      if (photo) await send({ photo }, t('updated'));
    } catch (error) {
      failed(error);
    } finally {
      setPicking(false);
    }
  };

  const choose = (from: UploadFileSource) => {
    // A browser opens its picker only from the tap itself.
    if (Platform.OS === 'web') void pick(from);
    else source.current = from;
    setOpen(false);
  };

  return (
    <>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={t('change')}
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        onPress={() => setOpen(true)}
        className="rounded-full bg-surface p-1">
        <Avatar name={name} imageUrl={imageUrl} size="xl" />
        {busy ? (
          <View className="absolute inset-1 items-center justify-center rounded-full bg-scrim/45">
            <ActivityIndicator color={spinner ? String(spinner) : undefined} />
          </View>
        ) : null}
        {/* The shopper app's badge: a floating white circle on the ring's lower end. */}
        <View
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          className="absolute end-1 bottom-1 size-[33px] items-center justify-center rounded-full bg-surface shadow-button dark:border dark:border-border">
          <Icon name="camera" size={18} />
        </View>
      </PressableScale>

      <Sheet
        visible={open}
        title={t('title')}
        onClose={() => setOpen(false)}
        onClosed={() => {
          const from = source.current;
          source.current = null;
          if (from) void pick(from);
        }}>
        <View className="gap-2">
          <RowGroup bare>
            <NavRow
              leading={<IconCircle icon="image" tone="success" size="md" />}
              title={t('library')}
              description={t('libraryHint')}
              chevron={false}
              onPress={() => choose('photo-library')}
            />
            <NavRow
              leading={<IconCircle icon="camera" tone="info" size="md" />}
              title={t('camera')}
              chevron={false}
              onPress={() => choose('camera')}
            />
            {imageUrl ? (
              <NavRow
                leading={<IconCircle icon="trash" tone="danger" size="md" />}
                title={t('remove')}
                chevron={false}
                onPress={() => {
                  setOpen(false);
                  void send({ remove: true }, t('removed'));
                }}
              />
            ) : null}
          </RowGroup>
          <GroupFootnote text={t('hint')} className="px-0" />
        </View>
      </Sheet>
    </>
  );
}
