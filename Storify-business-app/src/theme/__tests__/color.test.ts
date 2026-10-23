import { isColor, parseColor, transparentOf, withOpacity } from '../color';

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

describe('withOpacity', () => {
  it('keeps the channels and scales the colour’s own opacity', () => {
    expect(withOpacity('#ffffff', 0.15)).toBe('rgba(255, 255, 255, 0.15)');
    expect(withOpacity('rgba(1, 2, 3, 0.5)', 0.5)).toBe('rgba(1, 2, 3, 0.25)');
    expect(transparentOf('#366FFF')).toBe('rgba(54, 111, 255, 0)');
  });

  it('gives a colour it cannot read as transparent', () => {
    expect(withOpacity('blue', 0.5)).toBe('transparent');
  });
});
