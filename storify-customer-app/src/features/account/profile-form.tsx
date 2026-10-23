import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
  type ImagePickerOptions,
  type ImagePickerResult,
} from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { uploadPhoto } from '@/api/endpoints/uploads';
import { updateMe } from '@/api/endpoints/me';
import { queryKeys } from '@/api/query-keys';
import type { FormFile } from '@/api/transport';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Icon, type IconName } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Sheet } from '@/components/ui/sheet';
import { FieldLabel, TextField } from '@/components/ui/text-field';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { GENDERS, type Me } from '@/contracts/mobile/shop/v1';
import { FormError } from '@/features/auth/screens/auth-sheet';
import { useLocale } from '@/i18n/locale-store';
import { useErrorMessage } from '@/i18n/use-error-message';

import { AccentPicker } from './accent-picker';
import { Avatar } from './account-parts';
import {
  profileChanges,
  profileErrors,
  profileValues,
  type ProfileField,
  type ProfileValues,
} from './profile-changes';
import { useUpdateMe } from './use-me';

const INVALID = {
  name: 'nameInvalid',
  phone: 'phoneInvalid',
  birthday: 'birthdayInvalid',
  gender: 'genderInvalid',
} as const satisfies Record<ProfileField, string>;

/** A phone photo is many megabytes: compressed this much it is still sharp at the avatar's size. */
const QUALITY = 0.7;
const PICK: ImagePickerOptions = {
  mediaTypes: 'images',
  allowsEditing: true,
  aspect: [1, 1],
  quality: QUALITY,
};

/** The picked photo as a form sends it. The store judges its type and size. */
function pickedFile(result: ImagePickerResult): FormFile | undefined {
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return undefined;
  const type = asset.mimeType ?? 'image/jpeg';
  const name = asset.fileName ?? `photo.${type.slice(type.indexOf('/') + 1)}`;
  return { uri: asset.uri, name, type };
}

/**
 * Changes the profile picture: a new photo is uploaded, then named in
 * `PATCH /me`; `null` removes the picture. The store's answer replaces the
 * cached profile, so Profile and the Account header show it. A refusal leaves
 * the cache, and the old picture, as it was.
 */
export function usePictureChange() {
  const locale = useLocale();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: FormFile | null) => {
      const imageUploadId = file ? (await uploadPhoto(locale, file)).id : null;
      return updateMe(locale, { imageUploadId });
    },
    onSuccess: (me) => queryClient.setQueryData(queryKeys.me(locale), me),
  });
}

type PictureAction = { icon: IconName; label: string; onPress: () => void };

function PictureRow({ icon, label, onPress }: PictureAction) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="min-h-[52px] flex-row items-center gap-3 py-3.5 active:opacity-70">
      <Icon name={icon} size={22} />
      <Text variant="subheading">{label}</Text>
    </Pressable>
  );
}

/** The avatar with its camera badge, which offers the camera, the library and, with a picture, removing it. */
function ProfilePicture({ me }: { me: Me }) {
  const t = useTranslations('profile');
  const toast = useToast();
  const describe = useErrorMessage();
  const change = usePictureChange();
  const [open, setOpen] = useState(false);
  const [cameraDenied, setCameraDenied] = useState(false);
  const hasPicture = Boolean(me.image ?? me.imageUrl);

  const send = (file: FormFile | null) => {
    setOpen(false);
    setCameraDenied(false);
    change.mutate(file, {
      onSuccess: () => toast.show({ message: t(file ? 'pictureSaved' : 'pictureRemoved') }),
    });
  };
  const fromCamera = async () => {
    const permission = await requestCameraPermissionsAsync();
    setCameraDenied(!permission.granted);
    if (!permission.granted) return;
    const file = pickedFile(await launchCameraAsync(PICK));
    if (file) send(file);
  };
  const fromLibrary = async () => {
    const file = pickedFile(await launchImageLibraryAsync(PICK));
    if (file) send(file);
  };

  const problem = cameraDenied
    ? t('cameraDenied')
    : change.isError
      ? describe(change.error)
      : undefined;

  return (
    <>
      <View>
        <Avatar image={me.image} imageUrl={me.imageUrl} size="lg" />
        <IconButton
          icon="camera"
          label={t('pictureChange')}
          disabled={change.isPending}
          onPress={() => setOpen(true)}
          className="absolute bottom-1 end-1"
        />
      </View>
      {change.isPending ? <Text variant="caption">{t('pictureSaving')}</Text> : null}
      <FormError message={problem} />

      <Sheet visible={open} onClose={() => setOpen(false)} title={t('picture')}>
        <PictureRow icon="camera" label={t('pictureCamera')} onPress={fromCamera} />
        <PictureRow icon="image-add" label={t('pictureLibrary')} onPress={fromLibrary} />
        {hasPicture ? (
          <PictureRow icon="trash" label={t('pictureRemove')} onPress={() => send(null)} />
        ) : null}
      </Sheet>
    </>
  );
}

/**
 * Profile: the picture over a `background` card, the
 * name, and the fields the store keeps. The email is the login and is shown,
 * not edited. Emptying a field clears it.
 */
export function ProfileForm({ me }: { me: Me }) {
  const t = useTranslations('profile');
  const toast = useToast();
  const describe = useErrorMessage();
  const update = useUpdateMe();
  const [values, setValues] = useState<ProfileValues>(() => profileValues(me));
  const [invalid, setInvalid] = useState<ProfileField[]>([]);

  const changes = profileChanges(me, values);
  const changed = Object.keys(changes).length > 0;
  const set = (field: ProfileField) => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }));
  const errorOf = (field: ProfileField) =>
    invalid.includes(field) ? t(INVALID[field]) : undefined;

  const save = () => {
    const found = profileErrors(changes, new Date());
    setInvalid(found);
    if (found.length > 0) return;
    update.mutate(changes, {
      onSuccess: (saved) => {
        setValues(profileValues(saved));
        toast.show({ message: t('saved') });
      },
    });
  };

  return (
    <View className="mt-14 rounded-t-3xl bg-background px-5 pb-6">
      <View className="-mt-14 items-center gap-3">
        <ProfilePicture me={me} />
        <Text variant="heading" accessibilityRole="header">
          {me.name}
        </Text>
      </View>

      <View className="mt-6 gap-4">
        <TextField
          label={t('name')}
          value={values.name}
          onChangeText={set('name')}
          error={errorOf('name')}
          autoComplete="name"
          textContentType="name"
        />
        <View className="gap-1.5">
          <FieldLabel label={t('email')} />
          <Text>{me.email}</Text>
          <Text variant="caption">{t('emailNote')}</Text>
        </View>
        <TextField
          label={t('phone')}
          value={values.phone}
          onChangeText={set('phone')}
          error={errorOf('phone')}
          hint={t('phoneHint')}
          optional
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
        />
        <TextField
          label={t('birthday')}
          value={values.birthday}
          onChangeText={set('birthday')}
          error={errorOf('birthday')}
          hint={t('birthdayHint')}
          optional
          placeholder={t('birthdayPlaceholder')}
          keyboardType="numbers-and-punctuation"
          autoComplete="birthdate-full"
        />
        <View className="gap-2" accessibilityRole="radiogroup" accessibilityLabel={t('gender')}>
          <FieldLabel label={t('gender')} optional />
          <View className="flex-row flex-wrap gap-2">
            {(['', ...GENDERS] as const).map((gender) => (
              <Chip
                key={gender || 'none'}
                label={t(gender || 'none')}
                accessibilityRole="radio"
                selected={values.gender === gender}
                onPress={() => set('gender')(gender)}
              />
            ))}
          </View>
        </View>

        <FormError message={update.isError ? describe(update.error) : undefined} />
        {/* The accent applies on tap and stays on the phone; only Save sends the fields above. */}
        <View className="mt-2 flex-row items-center justify-between gap-3">
          <AccentPicker />
          <Button
            label={t('save')}
            variant="accent"
            loading={update.isPending}
            disabled={!changed}
            onPress={save}
            className="min-w-[120px]"
          />
        </View>
      </View>
    </View>
  );
}
