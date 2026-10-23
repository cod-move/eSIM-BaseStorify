export const guestTrackingKeys = {
  /**
   * Looking a guest's order up is a POST, so nothing of it is cached: the
   * contact would sit in the cache's key. The key only names the mutation.
   */
  guestTrack: (locale: string) => ['guest', locale, 'orders', 'track'] as const,
};
