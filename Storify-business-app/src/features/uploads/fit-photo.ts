import { ImageManipulator, SaveFormat, type ImageResult } from 'expo-image-manipulator';

import { matchesUploadMime, type UploadLimits } from './selected-file';

/**
 * The longest edge, then the quality, tried in turn until a photo fits the
 * store's limit: as large and sharp as the limit allows. A phone's camera
 * takes photos of 3 to 12 MB, and a store takes 4 MB at most (often less).
 */
const STEPS = [
  { edge: 2560, compress: 0.85 },
  { edge: 2048, compress: 0.8 },
  { edge: 1600, compress: 0.75 },
  { edge: 1280, compress: 0.7 },
  { edge: 1024, compress: 0.6 },
] as const;

/** Pictures the phone can redraw smaller. Not a GIF (it would lose its motion) nor an SVG. */
const SHRINKABLE = /^image\/(jpeg|jpg|png|webp|heic|heif|avif)$/;

/**
 * Whether a picked file is a photo the store would refuse as it is (too large,
 * or in a format it does not take, such as an iPhone's HEIC) but would take
 * redrawn: smaller, as JPEG or WebP.
 */
export function needsFitting(mimeType: string, size: number, limits: UploadLimits): boolean {
  const type = mimeType.toLowerCase();
  return (
    SHRINKABLE.test(type) && (size > limits.maxBytes || !matchesUploadMime(type, limits.mimeTypes))
  );
}

export type FittedPhoto = {
  uri: string;
  mimeType: string;
  filename: string;
  /** The bytes, when asked for: the browser has no file to read them from. */
  base64?: string;
};

type FitOptions = {
  /** How many bytes a saved rendition takes. */
  measure: (saved: ImageResult) => number;
  /** Keep the bytes of the result as base64 (the browser preview). */
  base64?: boolean;
};

/**
 * A photo the store would refuse, redrawn to fit it: at most 2560 pixels on its
 * longest edge, smaller and more compressed step by step until it is within
 * `maxBytes`. A PNG becomes WebP where the store takes it, so a transparent
 * background stays transparent; anything else becomes JPEG (else WebP).
 *
 * `null` when the store takes neither JPEG nor WebP. Otherwise the smallest
 * rendition, even if it is still too large: the selection then says so.
 */
export async function fitPhoto(
  photo: { uri: string; filename: string; mimeType: string; width?: number; height?: number },
  limits: UploadLimits,
  { measure, base64 = false }: FitOptions
): Promise<FittedPhoto | null> {
  const jpeg = matchesUploadMime('image/jpeg', limits.mimeTypes);
  const webp = matchesUploadMime('image/webp', limits.mimeTypes);
  const format =
    photo.mimeType.toLowerCase() === 'image/png' && webp
      ? SaveFormat.WEBP
      : jpeg
        ? SaveFormat.JPEG
        : webp
          ? SaveFormat.WEBP
          : null;
  if (!format) return null;

  let { width = 0, height = 0 } = photo;
  if (!width || !height) {
    const original = await ImageManipulator.manipulate(photo.uri).renderAsync();
    ({ width, height } = original);
  }
  const landscape = width >= height;
  const longest = Math.max(width, height);
  const mimeType = format === SaveFormat.WEBP ? 'image/webp' : 'image/jpeg';
  const filename = `${photo.filename.replace(/\.[^./\\]+$/, '') || 'photo'}.${
    format === SaveFormat.WEBP ? 'webp' : 'jpg'
  }`;

  let fitted: FittedPhoto | null = null;
  for (const step of STEPS) {
    const context = ImageManipulator.manipulate(photo.uri);
    if (longest > step.edge) {
      context.resize(landscape ? { width: step.edge } : { height: step.edge });
    }
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ format, compress: step.compress, base64 });
    fitted = {
      uri: saved.uri,
      mimeType,
      filename,
      ...(saved.base64 ? { base64: saved.base64 } : {}),
    };
    if (measure(saved) <= limits.maxBytes) return fitted;
  }
  return fitted;
}
