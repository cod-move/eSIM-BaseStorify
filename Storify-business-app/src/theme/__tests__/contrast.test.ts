import { parseColor } from '../color';

/**
 * The colour pairs the design promises, measured as
 * WCAG 2 contrast: 4.5:1 for text, 3:1 for a status chip's dot and other
 * graphics. A token changed in global.css that breaks one fails here.
 */

const { readFileSync } = jest.requireActual<{
  readFileSync: (path: string, encoding: 'utf8') => string;
}>('fs');
const stylesheet = readFileSync(`${process.cwd()}/src/global.css`, 'utf8');

function token(theme: 'light' | 'dark', name: string): string {
  const start = stylesheet.indexOf(`@variant ${theme} {`);
  const end = stylesheet.indexOf('}', start);
  const value = new RegExp(`--color-${name}:\\s*([^;]+);`).exec(stylesheet.slice(start, end))?.[1];
  if (!value) throw new Error(`No --color-${name} in the ${theme} theme`);
  return value;
}

function luminance(color: string): number {
  const parsed = parseColor(color);
  if (!parsed) throw new Error(`Not a colour: ${color}`);
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(parsed.r) + 0.7152 * linear(parsed.g) + 0.0722 * linear(parsed.b);
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

const TONES = ['info', 'success', 'warning', 'danger'] as const;

describe.each(['light', 'dark'] as const)('the %s theme', (theme) => {
  const c = (name: string) => token(theme, name);

  it.each(TONES)('%s reads as text on cards and on the page', (tone) => {
    expect(contrast(c(tone), c('surface'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c(tone), c('background'))).toBeGreaterThanOrEqual(4.5);
  });

  it.each([...TONES, 'surface-alt'])('a chip on %s reads, and its dot shows', (tone) => {
    const fill = tone === 'surface-alt' ? c('surface-alt') : c(`${tone}-soft`);
    const dot = tone === 'surface-alt' ? c('muted') : c(tone);
    expect(contrast(c('foreground'), fill)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dot, fill)).toBeGreaterThanOrEqual(3);
  });

  it('keeps a danger button’s label readable', () => {
    expect(contrast(c('danger-foreground'), c('danger'))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps muted text readable on cards', () => {
    expect(contrast(c('muted'), c('surface'))).toBeGreaterThanOrEqual(4.5);
  });
});
