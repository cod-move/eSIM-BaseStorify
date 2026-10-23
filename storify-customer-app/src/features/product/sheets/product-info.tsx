import { View } from 'react-native';

import { RichText } from '@/components/ui/rich-text';
import { Text } from '@/components/ui/text';
import { useOpenLink } from '@/features/config/use-open-link';

/**
 * The Description sheet's content: the product's name, then the
 * merchant's HTML, drawn natively with its pictures in their own
 * proportions.
 */
export function ProductDescription({ name, html }: { name: string; html: string }) {
  const openLink = useOpenLink();

  return (
    <View className="gap-6">
      <Text variant="display" accessibilityRole="header">
        {name}
      </Text>
      <RichText html={html} onLinkPress={openLink} />
    </View>
  );
}

/** The Specification sheet's content: the store's attributes, in the merchant's order, as a two-column table. */
export function ProductSpecification({
  attributes,
}: {
  attributes: { name: string; value: string }[];
}) {
  return (
    <View>
      {attributes.map((attribute, index) => (
        <View
          key={`${attribute.name}-${index}`}
          accessible
          className="flex-row gap-4 border-b border-border py-4">
          <Text variant="label" className="w-2/5">
            {attribute.name}
          </Text>
          <Text variant="long" className="flex-1 text-muted">
            {attribute.value}
          </Text>
        </View>
      ))}
    </View>
  );
}
