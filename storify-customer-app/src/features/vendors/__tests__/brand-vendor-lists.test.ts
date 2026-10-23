import { BrandList, LIST_MAX_LIMIT, VendorList } from '@/contracts/mobile/shop/v1';

import { dataOf } from '@/api/__tests__/mock-helpers';
import { resetMockServer } from '@/api/mocks/server';

beforeEach(() => resetMockServer());

/** Follows `nextCursor` to the last page, as the app does, and counts what it was handed. */
async function slugsThroughCursor(
  path: '/brands' | '/vendors',
  schema: typeof BrandList | typeof VendorList
) {
  const slugs: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const query: string = cursor
      ? `?limit=${LIST_MAX_LIMIT}&cursor=${cursor}`
      : `?limit=${LIST_MAX_LIMIT}`;
    const page = await dataOf(schema, `${path}${query}`);
    slugs.push(...page.items.map((item) => item.slug));
    cursor = page.nextCursor;
    pages += 1;
  } while (cursor);
  return { slugs, pages };
}

describe('the mock store lists brands and vendors past one page', () => {
  it.each([
    ['/brands', BrandList],
    ['/vendors', VendorList],
  ] as const)(
    '%s answers more than 40 items through the cursor, each once',
    async (path, schema) => {
      const { slugs, pages } = await slugsThroughCursor(path, schema);

      expect(slugs.length).toBeGreaterThan(LIST_MAX_LIMIT);
      expect(pages).toBeGreaterThan(1);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  );
});
