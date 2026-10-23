/** Endpoints: reports the app sends the store. */
import { SponsoredEventsResult, type SponsoredEventsRequest } from '@/contracts/mobile/shop/v1';

import { api } from '../api';

/**
 * POST /events/sponsored: how many times the cards of a paid campaign were seen
 * and opened. It is sent once, with a short timeout: the store counts what it
 * receives and the app never retries.
 */
export function postSponsoredEvents(locale: string, body: SponsoredEventsRequest) {
  return api.data(
    { locale, path: '/events/sponsored', method: 'POST', body, timeoutMs: 8000 },
    SponsoredEventsResult
  );
}
