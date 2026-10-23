export const overviewKeys = {
  /** The signed-in shopper's badges and saved product ids. */
  overview: (locale: string) => ['private', locale, 'overview'] as const,
};
