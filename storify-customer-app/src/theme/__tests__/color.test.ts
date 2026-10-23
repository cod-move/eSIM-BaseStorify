import { isColor, parseColor, withAlpha } from '../color';

describe('parseColor', () => {
  it('reads hex in its four lengths', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('#366FFF')).toEqual({ r: 54, g: 111, b: 255, a: 1 });
    expect(parseColor('#0008')).toEqual({ r: 0, g: 0, b: 0, a: 136 / 255 });
    expect(parseColor('#00000080')).toEqual({ r: 0, g: 0, b: 0, a: 128 / 255 });
  });

  it('reads rgb() and rgba(), with commas or spaces', () => {
    expect(parseColor('rgb(1, 2, 3)')).toEqual({ r: 1, g: 2, b: 3, a: 1 });
    expect(parseColor('rgba(1, 2, 3, 0.5)')).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
    expect(parseColor('rgb(1 2 3 / 50%)')).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
  });

  it.each([
    '',
    'blue',
    '#12',
    '#12345',
    '#gggggg',
    'rgb(1, 2)',
    'rgb(300, 0, 0)',
    'rgba(0, 0, 0, 2)',
    'hsl(0 0% 0%)',
  ])('does not read %j', (value) => {
    expect(parseColor(value)).toBeNull();
    expect(isColor(value)).toBe(false);
  });

  it('does not take a value that is not a string for a colour', () => {
    expect(isColor(undefined)).toBe(false);
    expect(isColor(12)).toBe(false);
  });
});

describe('withAlpha', () => {
  it('keeps the colour and changes the opacity', () => {
    expect(withAlpha('#366fff', 0)).toBe('rgba(54, 111, 255, 0)');
    expect(withAlpha('rgba(0, 0, 0, 0.5)', 0.5)).toBe('rgba(0, 0, 0, 0.25)');
  });

  it('gives null for a value the app cannot read', () => {
    expect(withAlpha('blue', 0.5)).toBeNull();
  });
});
