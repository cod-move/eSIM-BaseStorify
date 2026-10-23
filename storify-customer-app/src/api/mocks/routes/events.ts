/** The reports the app sends: sponsored impressions and clicks. */
import { SponsoredEventsRequest, type SponsoredEventsResult } from '@/contracts/mobile/shop/v1';

import { MockError, type MockContext, type MockRoute } from '../kit';

export const routes: MockRoute[] = [
  { method: 'POST', path: '/events/sponsored', handle: sponsoredEvents },
];

/** Counts every event it is given, as the store does for a campaign that is running. */
function sponsoredEvents({ body }: MockContext): SponsoredEventsResult {
  const parsed = SponsoredEventsRequest.safeParse(body);
  if (!parsed.success) {
    throw new MockError(400, 'VALIDATION_ERROR', 'The events are not in the contract shape');
  }
  return { recorded: parsed.data.events.length };
}
