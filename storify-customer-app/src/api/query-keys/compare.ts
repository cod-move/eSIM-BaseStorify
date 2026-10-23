export const compareKeys = {
  compare: (locale: string, slugs: readonly string[]) =>
    ['public', locale, 'compare', slugs.join(',')] as const,
};
