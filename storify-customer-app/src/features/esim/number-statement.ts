import { File, Paths } from 'expo-file-system';
import { shareAsync } from 'expo-sharing';

import type { EsimNumberStatement } from '@/contracts/mobile/shop/v1/esim';

/** The phone bill (a PDF the store sends as base64) kept in the cache folder and handed to the phone's viewer. */
export async function openNumberStatement(statement: EsimNumberStatement): Promise<void> {
  const binary = atob(statement.pdfBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);

  const file = new File(Paths.cache, statement.fileName.replace(/[^\w.-]/g, '_'));
  file.create({ overwrite: true });
  file.write(bytes);
  await shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
}

/** The last twelve whole months, newest first, as "YYYY-MM". */
export function pastMonths(now = new Date()): string[] {
  const months: string[] = [];
  for (let back = 1; back <= 12; back += 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    months.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}
