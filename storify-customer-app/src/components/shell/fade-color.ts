/**
 * The same colour, fully transparent: the start of a gradient that fades into
 * `color`. A gradient between `transparent` and a colour passes through grey on
 * some phones, because `transparent` is black at no opacity; the colour's own
 * channels at no opacity do not.
 *
 * The page's colour is a design token and so a hex value. Anything else (a
 * colour the store might one day set in another notation) falls back to
 * `transparent`.
 */
export function transparentOf(color: string): string {
  const hex = /^#([0-9a-f]{3,8})$/i.exec(color.trim())?.[1];
  if (!hex) return 'transparent';

  if (hex.length === 3 || hex.length === 4) {
    const [r, g, b] = hex;
    return `#${r}${r}${g}${g}${b}${b}00`;
  }
  if (hex.length === 6 || hex.length === 8) return `#${hex.slice(0, 6)}00`;
  return 'transparent';
}
