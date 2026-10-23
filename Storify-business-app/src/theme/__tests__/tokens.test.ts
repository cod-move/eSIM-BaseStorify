import { Uniwind } from 'uniwind';

import { parseColor } from '../color';
import { applyThemeColors, COLOR_TOKENS } from '../tokens';

const updateCSSVariables = jest.mocked(Uniwind.updateCSSVariables);

// The tests run from the project's root. Node's own types are not part of the app's.
const { readFileSync } = jest.requireActual<{
  readFileSync: (path: string, encoding: 'utf8') => string;
}>('fs');
const stylesheet = readFileSync(`${process.cwd()}/src/global.css`, 'utf8');

/** The `--color-*` names a theme block of the stylesheet defines. */
function definedIn(theme: 'light' | 'dark'): string[] {
  const start = stylesheet.indexOf(`@variant ${theme} {`);
  const end = stylesheet.indexOf('}', start);
  return [...stylesheet.slice(start, end).matchAll(/--color-([a-z-]+):/g)].flatMap(
    (match) => match[1] ?? []
  );
}

/** A theme block's value for one token. */
function valueIn(theme: 'light' | 'dark', token: string): string | undefined {
  const start = stylesheet.indexOf(`@variant ${theme} {`);
  const end = stylesheet.indexOf('}', start);
  return new RegExp(`--color-${token}:\\s*([^;]+);`).exec(stylesheet.slice(start, end))?.[1];
}

describe('the colour tokens', () => {
  it.each(['light', 'dark'] as const)(
    'are the ones the %s theme of global.css defines',
    (theme) => {
      expect(definedIn(theme).sort()).toEqual([...COLOR_TOKENS].sort());
    }
  );

  it.each(['light', 'dark'] as const)(
    'have a colour the app can read, in the %s theme',
    (theme) => {
      for (const token of COLOR_TOKENS) {
        expect(parseColor(valueIn(theme, token) ?? '')).not.toBeNull();
      }
    }
  );
});

describe('applyThemeColors', () => {
  it('replaces a token in the theme it is given, as a CSS variable', () => {
    applyThemeColors({ light: { primary: '#366fff' }, dark: { 'primary-foreground': '#111111' } });

    expect(updateCSSVariables).toHaveBeenCalledWith('light', { '--color-primary': '#366fff' });
    expect(updateCSSVariables).toHaveBeenCalledWith('dark', {
      '--color-primary-foreground': '#111111',
    });
  });

  it('can replace any token, not only the brand colours', () => {
    applyThemeColors({ dark: { danger: 'rgb(10, 20, 30)' } });

    expect(updateCSSVariables).toHaveBeenCalledWith('dark', {
      '--color-danger': 'rgb(10, 20, 30)',
    });
  });

  it('skips a value the app cannot read, and a name that is not a token', () => {
    applyThemeColors({
      light: { primary: 'blue', accent: 'var(--x)', link: '#5b57ff' },
      dark: { background: 'hsl(0 0% 10%)', ['nonsense' as 'link']: '#ffffff' },
    });

    expect(updateCSSVariables).toHaveBeenCalledTimes(1);
    expect(updateCSSVariables).toHaveBeenCalledWith('light', { '--color-link': '#5b57ff' });
  });

  it('does nothing for an empty theme', () => {
    applyThemeColors({});
    applyThemeColors({ light: {}, dark: {} });

    expect(updateCSSVariables).not.toHaveBeenCalled();
  });
});
