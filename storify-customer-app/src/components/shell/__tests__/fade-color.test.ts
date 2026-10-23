import { transparentOf } from '../fade-color';

describe('transparentOf', () => {
  it('keeps the colour and drops its opacity to nothing', () => {
    expect(transparentOf('#f6f6f6')).toBe('#f6f6f600');
    expect(transparentOf('#F6F6F6FF')).toBe('#F6F6F600');
    expect(transparentOf(' #abc ')).toBe('#aabbcc00');
    expect(transparentOf('#abcd')).toBe('#aabbcc00');
  });

  it('falls back to transparent for what is not a hex colour', () => {
    expect(transparentOf('')).toBe('transparent');
    expect(transparentOf('rgb(1 2 3)')).toBe('transparent');
    expect(transparentOf('#12345')).toBe('transparent');
  });
});
