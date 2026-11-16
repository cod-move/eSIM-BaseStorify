import en from './en.json';

/**
 * The eSIM area's words, merged into the app's own under `esim` (patch P77 in
 * src/i18n/messages.ts). English is the source; a language without a file
 * shows English.
 */
export const esimEnglish = en;

const FILES: Record<string, () => Record<string, unknown>> = {
  zh: () => require('./zh.json'),
};

/** The language's eSIM words, or nothing (English is used). */
export function esimMessagesOf(language: string): Record<string, unknown> | undefined {
  return FILES[language]?.();
}
