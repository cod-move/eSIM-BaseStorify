import { createSponsoredReporter } from '../sponsored-events';

const A = 'a'.repeat(24);
const B = 'b'.repeat(24);

function setup(send = jest.fn().mockResolvedValue({ recorded: 1 })) {
  return { send, reporter: createSponsoredReporter({ send, flushAfterMs: 1000 }) };
}

describe('the sponsored events reporter', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('counts a card as seen once per visit but every click, and sends them together', async () => {
    const { send, reporter } = setup();
    reporter.impression('HOME', A);
    reporter.impression('HOME', A);
    reporter.impression('HOME', B);
    reporter.impression('LISTING', A);
    reporter.click('HOME', A);
    reporter.click('HOME', A);
    expect(send).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1000);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual([
      { campaignId: A, placement: 'HOME', kind: 'IMPRESSION' },
      { campaignId: B, placement: 'HOME', kind: 'IMPRESSION' },
      { campaignId: A, placement: 'LISTING', kind: 'IMPRESSION' },
      { campaignId: A, placement: 'HOME', kind: 'CLICK' },
      { campaignId: A, placement: 'HOME', kind: 'CLICK' },
    ]);
  });

  it('never sends an id the store would refuse the whole batch for', async () => {
    const { send, reporter } = setup();
    reporter.impression('HOME', 'not-a-campaign');
    reporter.click('HOME', '');
    reporter.impression('HOME', A);

    reporter.flush();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual([
      { campaignId: A, placement: 'HOME', kind: 'IMPRESSION' },
    ]);
  });

  it('keeps a batch to what the store accepts, and sends at once when it is full', async () => {
    const { send, reporter } = setup();
    for (let i = 0; i < 50; i += 1) reporter.click('HOME', A);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toHaveLength(50);

    for (let i = 0; i < 3; i += 1) reporter.click('HOME', B);
    reporter.flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toHaveLength(3);
  });

  it('does not wait for the answer, and does not send a refused batch again', async () => {
    const send = jest.fn().mockRejectedValue(new Error('offline'));
    const { reporter } = setup(send);
    reporter.click('HOME', A);

    expect(() => reporter.flush()).not.toThrow();
    await jest.advanceTimersByTimeAsync(10_000);
    reporter.flush();

    expect(send).toHaveBeenCalledTimes(1);
  });
});
