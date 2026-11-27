import { View } from 'react-native';

import { AppImage } from '@/components/ui/app-image';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { env } from '@/config/env';
import type { EsimDestination } from '@/contracts/mobile/shop/v1/esim';

/**
 * A destination's flag in a white circle, as the website draws it: the
 * store's flag pictures (public/esim/flags, the same files), since Android
 * and Windows fonts may draw a flag emoji as two letters. A country shows its
 * own flag; the world a globe; a region a white globe on a colour of its own
 * (the same each time, from its countries), as the website draws them.
 */

/** "🇪🇺" → "EU"; null for any other text. */
export function emojiFlagCode(emoji: string | undefined): string | null {
  const points = [...(emoji ?? '').trim()].map((char) => char.codePointAt(0) ?? 0);
  if (points.length !== 2 || points.some((point) => point < 0x1f1e6 || point > 0x1f1ff))
    return null;
  return String.fromCharCode(...points.map((point) => point - 0x1f1e6 + 65));
}

/**
 * The two-letter code whose flag the destination shows, or null. Only a
 * country has one: every region and the world show the same globe, whatever
 * emoji was stored (🇪🇺, 🌍…), so those lists look alike.
 */
export function flagCodeOf(destination: Pick<EsimDestination, 'scope' | 'countries' | 'emoji'>) {
  if (destination.scope !== 'local') return null;
  const code = destination.countries[0] ?? emojiFlagCode(destination.emoji);
  return code && /^[A-Za-z]{2}$/.test(code) ? code.toUpperCase() : null;
}

export function flagUrl(code: string): string | null {
  return env.apiUrl ? `${env.apiUrl}/esim/flags/${code}.svg` : null;
}

const REGION_COLORS = [
  '#2563eb',
  '#0d9488',
  '#7c3aed',
  '#db2777',
  '#ea580c',
  '#16a34a',
  '#0891b2',
  '#ca8a04',
  '#4f46e5',
  '#dc2626',
];

/** A region's colour, picked from its countries so it stays the same (as the website's). */
export function regionColor(countries: string[]): string {
  let hash = 0;
  for (const char of countries.join(',')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return REGION_COLORS[hash % REGION_COLORS.length] ?? '#2563eb';
}

export function DestinationFlag({
  destination,
  size = 44,
}: {
  destination: Pick<EsimDestination, 'scope' | 'countries' | 'emoji'>;
  size?: number;
}) {
  const code = flagCodeOf(destination);
  const uri = code ? flagUrl(code) : null;
  const regional = destination.scope === 'regional';

  return (
    <View
      style={{
        width: size,
        height: size,
        padding: Math.max(2, Math.round(size * 0.05)),
        ...(regional ? { backgroundColor: regionColor(destination.countries) } : {}),
      }}
      className={`items-center justify-center rounded-full shadow-card ${regional ? '' : 'bg-white'}`}>
      {uri ? (
        <AppImage
          image={uri}
          size="thumb"
          contentFit="cover"
          className="size-full rounded-full"
          decorative
        />
      ) : destination.scope === 'local' && destination.emoji ? (
        <Text style={{ fontSize: size * 0.5, lineHeight: size * 0.62 }}>{destination.emoji}</Text>
      ) : (
        <Icon
          name="globe"
          size={Math.round(size * 0.55)}
          {...(regional ? { color: '#ffffff' } : {})}
        />
      )}
    </View>
  );
}
