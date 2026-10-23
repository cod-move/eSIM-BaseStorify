export const searchStartKeys = {
  searchStart: (locale: string) => ['public', locale, 'search-start'] as const,
  meSearchStart: (locale: string) => ['private', locale, 'search-start'] as const,
};
