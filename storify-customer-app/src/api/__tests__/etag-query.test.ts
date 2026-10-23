import { QueryClient } from '@tanstack/react-query';

import type { ApiResult } from '../client';
import { etagQuery, type Cached, type Conditional } from '../etag-query';

describe('etagQuery', () => {
  it('sends the cached validator, and keeps the cached object when nothing changed', async () => {
    const client = new QueryClient();
    const seen: (string | undefined)[] = [];
    const answers: ApiResult<{ name: string }>[] = [
      { notModified: false, data: { name: 'Storify' }, etag: 'W/"1"' },
      { notModified: true },
      { notModified: false, data: { name: 'Storify 2' }, etag: 'W/"2"' },
    ];
    const load = async ({ etag }: Conditional) => {
      seen.push(etag);
      const answer = answers.shift();
      if (!answer) throw new Error('No answer left');
      return answer;
    };
    const fetchOnce = () =>
      client.fetchQuery<Cached<{ name: string }>>({
        queryKey: ['config'],
        queryFn: etagQuery(load),
        staleTime: 0,
      });

    const first = await fetchOnce();
    const second = await fetchOnce();
    const third = await fetchOnce();

    expect(seen).toEqual([undefined, 'W/"1"', 'W/"1"']);
    expect(first).toEqual({ data: { name: 'Storify' }, etag: 'W/"1"' });
    // The very same object: a screen showing it does not re-render.
    expect(second).toBe(first);
    expect(third).toEqual({ data: { name: 'Storify 2' }, etag: 'W/"2"' });

    client.clear();
  });

  describe('a 200 that carries the validator already held', () => {
    /** Asks the same question once per answer, as a screen that refetches would. */
    async function ask(answers: ApiResult<{ name: string }>[]) {
      const client = new QueryClient();
      const load = async () => {
        const answer = answers.shift();
        if (!answer) throw new Error('No answer left');
        return answer;
      };
      const fetchOnce = () =>
        client.fetchQuery<Cached<{ name: string }>>({
          queryKey: ['home'],
          queryFn: etagQuery(load),
          staleTime: 0,
        });

      const results: Cached<{ name: string }>[] = [];
      while (answers.length > 0) results.push(await fetchOnce());
      client.clear();
      return results;
    }

    it('is "not modified" too: the cached object comes back', async () => {
      // A static route never answers 304. It sends the whole body again, with the same ETag.
      const [first, second, third] = await ask([
        { notModified: false, data: { name: 'Storify' }, etag: 'W/"1"' },
        { notModified: false, data: { name: 'Storify' }, etag: 'W/"1"' },
        { notModified: false, data: { name: 'Storify 2' }, etag: 'W/"2"' },
      ]);

      expect(second).toBe(first);
      expect(third).toEqual({ data: { name: 'Storify 2' }, etag: 'W/"2"' });
    });

    it('is compared the way If-None-Match is: W/"1" and "1" are one copy', async () => {
      const [first, second] = await ask([
        { notModified: false, data: { name: 'Storify' }, etag: 'W/"1"' },
        { notModified: false, data: { name: 'Storify' }, etag: '"1"' },
      ]);

      expect(second).toBe(first);
    });

    it('proves nothing when a validator is missing', async () => {
      const [first, second] = await ask([
        { notModified: false, data: { name: 'Storify' }, etag: undefined },
        { notModified: false, data: { name: 'Storify' }, etag: undefined },
      ]);

      expect(second).not.toBe(first);
      expect(second).toEqual({ data: { name: 'Storify' }, etag: undefined });
    });
  });
});
