/**
 * The colour values the app reads: hex (`#rgb`, `#rgba`, `#rrggbb`,
 * `#rrggbbaa`) and `rgb()` / `rgba()`, which is what `global.css` and the
 * store's theme editor write. Anything else is "a value the app cannot read":
 * the token keeps the app's own colour.
 */

type Rgba = { r: number; g: number; b: number; a: number };

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(\s*([^)]*)\)$/i;

/** The colour's channels (0 to 255) and opacity (0 to 1), or null when it is not one the app reads. */
export function parseColor(value: string): Rgba | null {
  const color = value.trim();

  const hex = HEX.exec(color)?.[1];
  if (hex) {
    const pairs =
      hex.length <= 4 ? [...hex].map((digit) => digit + digit) : (hex.match(/../g) ?? []);
    const [r = 0, g = 0, b = 0, a = 255] = pairs.map((pair) => parseInt(pair, 16));
    return { r, g, b, a: a / 255 };
  }

  const rgb = RGB.exec(color)?.[1];
  if (rgb) {
    // `rgb(1, 2, 3)`, `rgba(1, 2, 3, 0.5)` and `rgb(1 2 3 / 50%)`.
    const parts = rgb.split(/\s*[,/]\s*|\s+/).filter(Boolean);
    if (parts.length !== 3 && parts.length !== 4) return null;
    const [r = NaN, g = NaN, b = NaN] = parts.slice(0, 3).map(Number);
    const alpha = parts[3];
    const a =
      alpha === undefined
        ? 1
        : alpha.endsWith('%')
          ? Number(alpha.slice(0, -1)) / 100
          : Number(alpha);
    if ([r, g, b].some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 255)) {
      return null;
    }
    if (!Number.isFinite(a) || a < 0 || a > 1) return null;
    return { r, g, b, a };
  }

  return null;
}

export function isColor(value: unknown): value is string {
  return typeof value === 'string' && parseColor(value) !== null;
}

/**
 * The same colour at another opacity, as `rgba()`. A gradient that fades a
 * colour out needs its transparent end in that colour: plain `transparent` is
 * transparent black, and on a phone the fade would pass through grey.
 */
export function withAlpha(value: string, alpha: number): string | null {
  const color = parseColor(value);
  if (!color) return null;
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${Math.round(color.a * alpha * 1000) / 1000})`;
}
