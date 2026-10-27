import en from './en.json';

/**
 * The eSIM module's words, kept apart from the app's own files and merged
 * into them by `src/i18n/messages.ts` (patch P23). English holds every key;
 * another language's file may hold any part, the rest showing in English.
 */
export const ESIM_MESSAGES = en;

type PartialMessages = { [key: string]: string | PartialMessages };

// `require`, not `import`: only the active language's file is read.
const FILES: Record<string, () => PartialMessages> = {
  zh: () => require('./zh.json'),
};

export function esimMessagesOf(language: string): PartialMessages {
  return FILES[language]?.() ?? {};
}
