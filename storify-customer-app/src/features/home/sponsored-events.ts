import { useEffect, useMemo } from 'react';

import { postSponsoredEvents } from '@/api/endpoints/events';
import type { ProductCard, SponsoredEventsRequest } from '@/contracts/mobile/shop/v1';
import { useLocale } from '@/i18n/locale-store';

type SponsoredEvent = SponsoredEventsRequest['events'][number];
type Placement = SponsoredEvent['placement'];

/** The store refuses a whole batch for one id of another shape, so those are never sent. */
const CAMPAIGN_ID = /^[0-9a-fA-F]{24}$/;
/** The store takes at most 50 events in one request. */
const MAX_BATCH = 50;
/** How long events wait for company before they are sent. */
const FLUSH_AFTER_MS = 3000;

type ReporterOptions = {
  /** Sends one batch. What it returns or throws is of no interest to the reporter. */
  send: (events: SponsoredEvent[]) => Promise<unknown>;
  flushAfterMs?: number;
};

/**
 * Collects the impressions and clicks of paid cards and sends them in batches.
 *
 * A card counts as seen once per reporter (the reporter lives as long as the
 * screen visit that made it); every click counts. Sending never blocks the
 * screen and a batch that fails is dropped: the store counts what it receives.
 */
export function createSponsoredReporter({ send, flushAfterMs = FLUSH_AFTER_MS }: ReporterOptions) {
  let pending: SponsoredEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const seen = new Set<string>();

  /** Fire and forget: a refusal or a lost connection is not the shopper's concern. */
  function sendQuietly(batch: SponsoredEvent[]) {
    try {
      void Promise.resolve(send(batch)).catch(() => undefined);
    } catch {
      // The batch is dropped.
    }
  }

  function flush() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    const events = pending;
    pending = [];
    for (let start = 0; start < events.length; start += MAX_BATCH) {
      sendQuietly(events.slice(start, start + MAX_BATCH));
    }
  }

  function add(event: SponsoredEvent) {
    if (!CAMPAIGN_ID.test(event.campaignId)) return;
    pending.push(event);
    if (pending.length >= MAX_BATCH) flush();
    else timer ??= setTimeout(flush, flushAfterMs);
  }

  return {
    impression(placement: Placement, campaignId: string) {
      const key = `${placement}:${campaignId}`;
      if (seen.has(key)) return;
      seen.add(key);
      add({ campaignId, placement, kind: 'IMPRESSION' });
    },
    click(placement: Placement, campaignId: string) {
      add({ campaignId, placement, kind: 'CLICK' });
    },
    flush,
  };
}

/**
 * Reports the paid cards of one block. `seen` and `opened` take a card and do
 * nothing for one that is not paid, so a block can call them for every card.
 * What is waiting goes out when the block leaves the screen.
 */
export function useSponsoredEvents(placement: Placement) {
  const locale = useLocale();
  const reporter = useMemo(
    () =>
      createSponsoredReporter({
        send: (events) => postSponsoredEvents(locale, { events }),
      }),
    [locale]
  );

  useEffect(() => reporter.flush, [reporter]);

  return useMemo(
    () => ({
      seen: (product: ProductCard) => {
        if (product.sponsored) reporter.impression(placement, product.sponsored.campaignId);
      },
      opened: (product: ProductCard) => {
        if (product.sponsored) reporter.click(placement, product.sponsored.campaignId);
      },
    }),
    [reporter, placement]
  );
}
