import { QueryClient } from '@tanstack/react-query';

import type { ApiResult } from '../client';
import { etagPages, etagQuery, type Cached, type CachedPages } from '../etag-query';

type Page = { items: number[]; nextCursor: string | null };

const client = () => new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
const signal = new AbortController().signal;

describe('etagQuery', () => {
  it('sends the held validator and keeps the very same object on "not modified"', async () => {
    const queries = client();
    const held: Cached<{ n: number }> = { data: { n: 1 }, etag: 'W/"1"' };
    queries.setQueryData(['home'], held);
    const load = jest.fn(async (): Promise<ApiResult<{ n: number }>> => ({ notModified: true }));

    const fn = etagQuery(load);
    const result = await fn({
      client: queries,
      queryKey: ['home'],
      signal,
      meta: undefined,
    } as never);

    expect(load).toHaveBeenCalledWith({ etag: 'W/"1"', signal });
    expect(result).toBe(held);
  });

  it('treats a 200 with the held validator as "not modified", and a new one as new', async () => {
    const queries = client();
    const held: Cached<{ n: number }> = { data: { n: 1 }, etag: '"1"' };
    queries.setQueryData(['home'], held);

    const same = etagQuery(async () => ({ notModified: false, data: { n: 1 }, etag: 'W/"1"' }));
    const changed = etagQuery(async () => ({ notModified: false, data: { n: 2 }, etag: '"2"' }));
    const context = { client: queries, queryKey: ['home'], signal, meta: undefined } as never;

    expect(await same(context)).toBe(held);
    expect(await changed(context)).toEqual({ data: { n: 2 }, etag: '"2"' });
  });
});

describe('etagPages', () => {
  it('revalidates each page with the validator of the page held for the same cursor', async () => {
    const queries = client();
    const held: CachedPages<Page> = {
      pages: [
        { data: { items: [1, 2], nextCursor: 'c2' }, etag: '"p1"' },
        { data: { items: [3], nextCursor: null }, etag: '"p2"' },
      ],
      pageParams: [undefined, 'c2'],
    };
    queries.setQueryData(['orders'], held);
    const load = jest.fn(async (): Promise<ApiResult<Page>> => ({ notModified: true }));
    const fn = etagPages(load);
    const context = (pageParam: string | undefined) =>
      ({ client: queries, queryKey: ['orders'], signal, pageParam, meta: undefined }) as never;

    expect(await fn(context(undefined))).toBe(held.pages[0]);
    expect(await fn(context('c2'))).toBe(held.pages[1]);
    expect(load).toHaveBeenNthCalledWith(1, undefined, { etag: '"p1"', signal });
    expect(load).toHaveBeenNthCalledWith(2, 'c2', { etag: '"p2"', signal });
  });

  it('asks in full for a cursor it holds no page of', async () => {
    const queries = client();
    const load = jest.fn(async (): Promise<ApiResult<Page>> => ({
      notModified: false,
      data: { items: [9], nextCursor: null },
      etag: '"p9"',
    }));

    const page = await etagPages(load)({
      client: queries,
      queryKey: ['orders'],
      signal,
      pageParam: 'c9',
      meta: undefined,
    } as never);

    expect(load).toHaveBeenCalledWith('c9', { etag: undefined, signal });
    expect(page).toEqual({ data: { items: [9], nextCursor: null }, etag: '"p9"' });
  });
});
