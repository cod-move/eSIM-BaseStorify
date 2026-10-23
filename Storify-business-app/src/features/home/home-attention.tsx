import { router } from 'expo-router';
import { View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Tile, TileGrid } from '@/components/ui/tile';
import type { HomeTile } from '@/contracts/mobile/biz/v1';

import { HomeSection } from './home-section';
import { HOME_TILES } from './home-tiles';

/**
 * The work waiting: one tile per queue, two to a row,
 * each opening its list, in the store's order. A queue with work takes its
 * tone; an empty one stays quiet, and a figure the store did not send says so.
 */
export function HomeAttention({ tiles }: { tiles: HomeTile[] }) {
  const t = useTranslations('home');
  const format = useFormatter();
  if (!tiles.length) return null;

  return (
    <HomeSection title={t('attentionTitle')}>
      <TileGrid>
        {tiles.map((tile) => {
          const spec = HOME_TILES[tile.kind];
          const label = t(`tiles.${tile.kind}`);
          const { count } = tile;
          const waiting = count !== undefined && count > 0;
          const value = count === undefined ? t('unavailable') : format.number(count);
          return (
            <Tile
              key={tile.kind}
              icon={spec.icon}
              label={label}
              value={value}
              tone={waiting ? (spec.attention ?? 'neutral') : 'neutral'}
              emphasis={count === undefined ? 'missing' : waiting ? 'normal' : 'quiet'}
              accessibilityLabel={t('figureLabel', { label, value })}
              onPress={() => router.push(spec.href)}
            />
          );
        })}
      </TileGrid>
      {tiles.every((tile) => tile.count === 0) ? (
        <View className="flex-row items-center gap-3 rounded-[22px] bg-success-soft p-4">
          <Icon name="check-circle" size={22} colorClassName="accent-success" />
          <View className="flex-1 gap-0.5">
            <Text variant="label">{t('caughtUpTitle')}</Text>
            <Text variant="meta" className="text-foreground">
              {t('caughtUpBody')}
            </Text>
          </View>
        </View>
      ) : null}
    </HomeSection>
  );
}
