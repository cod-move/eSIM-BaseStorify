import { useRouter, type RelativePathString } from 'expo-router';
import { View } from 'react-native';

import { NavRow, RowGroup } from '@/components/ui/rows';
import { GalleryPage } from '@/dev/gallery-kit';

const PAGES: { title: string; href: RelativePathString }[] = [
  { title: 'Controls', href: './dev/controls' },
  { title: 'Cards', href: './dev/cards' },
  { title: 'Forms', href: './dev/forms' },
  { title: 'Overlays', href: './dev/overlays' },
  { title: 'States', href: './dev/states' },
  { title: 'Rich text', href: './dev/rich-text' },
  { title: 'Shell', href: './dev/shell' },
];

/**
 * Development only: every page of the kit gallery. The links are relative, and
 * as in a browser they start from the folder of `/dev`, which is the root: a
 * page another task has not added yet is then not a type error in the typed routes.
 */
export default function GalleryIndexScreen() {
  const router = useRouter();

  return (
    <GalleryPage>
      <View>
        <RowGroup>
          {PAGES.map(({ title, href }) => (
            <NavRow key={title} title={title} onPress={() => router.push(href)} />
          ))}
        </RowGroup>
      </View>
    </GalleryPage>
  );
}
