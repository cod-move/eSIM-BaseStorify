import { Share } from 'react-native';
import { useTranslations } from 'use-intl';

import { HeaderButton } from '@/components/shell/app-header';
import { useConfig } from '@/features/config/use-config';
import { useLocale } from '@/i18n/locale-store';
import { joinWebsiteUrl } from '@/lib/links';

/**
 * The share button of a brand, collection or vendor page, for the header's end: the
 * phone's own share sheet with the page's address on the store's website, in the
 * shopper's language. `path` is the page's path, as the app has it: `/brands/fieldnote`.
 * Nothing is drawn until the store's website is known.
 */
export function SharePageButton({ path, title }: { path: string; title: string }) {
  const t = useTranslations('browse');
  const locale = useLocale();
  const website = useConfig().data?.store.websiteUrl;
  if (!website) return null;

  const url = joinWebsiteUrl(website, `/${locale}${path}`);
  return (
    <HeaderButton
      icon="share"
      label={t('sharePage')}
      onPress={() => void Share.share({ title, message: `${title}\n${url}`, url })}
    />
  );
}
