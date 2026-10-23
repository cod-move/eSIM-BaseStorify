export const meKeys = {
  /** Who the operator is, and their workspaces. */
  me: (locale: string) => ['private', 'account', 'me', locale] as const,
};
