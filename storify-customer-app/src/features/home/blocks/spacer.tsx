import { View } from 'react-native';

import type { SpacerBlock } from '@/contracts/mobile/shop/v1';

/** Empty space between blocks, as tall as the store asks. */
export function Spacer({ block }: { block: SpacerBlock }) {
  return <View style={{ height: Math.max(0, block.height) }} />;
}
