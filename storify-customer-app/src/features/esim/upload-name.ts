/**
 * The name a picked file is sent under (patch P65), ASCII only. The name goes
 * into the multipart part's header, and Android's HTTP client throws on any
 * other character, so a photo named "微信图片_….jpg" never left the phone and
 * the app said "offline". An ASCII name is kept as it is (a document's name
 * helps whoever reads the chat); any other becomes `photo.<ext>` or
 * `document.<ext>`. Pure.
 */
export function uploadName(type: string, original?: string | null): string {
  const name = (original ?? '').trim();
  if (name && /^[\x20-\x7E]+$/.test(name) && !/["\\]/.test(name)) return name;
  const fromName = /\.([a-z0-9]{1,8})$/i.exec(name)?.[1]?.toLowerCase();
  const fromType = type
    .slice(type.indexOf('/') + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const extension = fromName ?? (fromType === 'jpeg' ? 'jpg' : fromType) ?? '';
  return `${type.startsWith('image/') ? 'photo' : 'document'}.${extension || 'jpg'}`;
}
