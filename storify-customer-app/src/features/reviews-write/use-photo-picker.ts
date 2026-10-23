import {
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
  type ImagePickerAsset,
  type ImagePickerOptions,
} from 'expo-image-picker';
import { useState } from 'react';

import type { FormFile } from '@/api/transport';
import type { UploadPolicy } from '@/contracts/mobile/shop/v1';

import { pickedPhoto } from './review-draft';

/** A phone photo is many megabytes: compressed this much it still shows every detail a review needs. */
const QUALITY = 0.7;

export type PickProblem = 'type' | 'size' | 'camera';

/**
 * Picks photos from the library (several at once, up to `room`) or takes one
 * with the camera, and keeps those the store takes under `policy`. A photo it
 * would refuse is left out and named by `problem`.
 */
export function usePhotoPicker(policy: UploadPolicy, onPicked: (files: FormFile[]) => void) {
  const [problem, setProblem] = useState<PickProblem>();

  const keep = (assets: ImagePickerAsset[]) => {
    const files: FormFile[] = [];
    let refused: PickProblem | undefined;
    for (const asset of assets) {
      const result = pickedPhoto(asset, policy);
      if ('file' in result) files.push(result.file);
      else refused = result.refused;
    }
    setProblem(refused);
    if (files.length > 0) onPicked(files);
  };

  const fromLibrary = async (room: number) => {
    const options: ImagePickerOptions = {
      mediaTypes: 'images',
      allowsMultipleSelection: room > 1,
      selectionLimit: room,
      quality: QUALITY,
    };
    const result = await launchImageLibraryAsync(options);
    if (!result.canceled) keep(result.assets.slice(0, room));
  };

  const fromCamera = async () => {
    const permission = await requestCameraPermissionsAsync();
    if (!permission.granted) {
      setProblem('camera');
      return;
    }
    const result = await launchCameraAsync({ mediaTypes: 'images', quality: QUALITY });
    if (!result.canceled) keep(result.assets.slice(0, 1));
  };

  return { fromLibrary, fromCamera, problem };
}
