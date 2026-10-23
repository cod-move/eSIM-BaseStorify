import { File, Paths } from 'expo-file-system';
import { shareAsync } from 'expo-sharing';

/** Keeps the PDF in the cache folder and hands it to the phone's viewer or share sheet. */
export async function openPdf(bytes: Uint8Array, name: string): Promise<void> {
  const file = new File(Paths.cache, `invoice-${name.replace(/[^\w-]/g, '_')}.pdf`);
  file.create({ overwrite: true });
  file.write(bytes);

  await shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
}
