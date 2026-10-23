import { useQuery } from '@tanstack/react-query';

import { getHome } from '@/api/endpoints/home';
import { etagQuery, type Cached } from '@/api/etag-query';
import { PERSISTED } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import { HOME_BLOCKS, type Home, type HomeBlock } from '@/contracts/mobile/shop/v1';
import { useLocale } from '@/i18n/locale-store';

/**
 * The home screen's blocks, with the ones this version of the app cannot draw
 * left out. Kept on the device, so home opens with content at once.
 */
export function useHome() {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.home(locale),
    queryFn: etagQuery((options) => getHome(locale, options)),
    select: knownBlocks,
    ...PERSISTED,
  });
}

type BlockSchema = (typeof HOME_BLOCKS)[keyof typeof HOME_BLOCKS];

/**
 * A store can gain a kind of block, or a new value in one of a block's lists,
 * after this app was built. Such a block, or one that does not match its
 * schema, is dropped here, so a screen only ever receives blocks it can draw.
 */
export function knownBlocks(cached: Cached<Home>): HomeBlock[] {
  return cached.data.blocks.flatMap((block): HomeBlock[] => {
    const schema = (HOME_BLOCKS as Record<string, BlockSchema | undefined>)[block.type];
    const parsed = schema?.safeParse(block);
    return parsed?.success ? [parsed.data] : [];
  });
}
