import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { getConfig } from '@/api/endpoints/config';
import { etagQuery, selectData } from '@/api/etag-query';
import { PERSISTED } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import { useLocale } from '@/i18n/locale-store';

/**
 * The store's settings: its name, languages, brand colours, and which features
 * and app versions it allows. Kept on the device, so the app has it the moment
 * it opens, and refreshed behind the screen.
 */
export function useConfig() {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.config(locale),
    queryFn: etagQuery((options) => getConfig(locale, options)),
    select: selectData,
    // On a change of language, keep showing the settings in the old one until
    // the new ones arrive, instead of closing the app behind a loading screen.
    placeholderData: keepPreviousData,
    ...PERSISTED,
  });
}
