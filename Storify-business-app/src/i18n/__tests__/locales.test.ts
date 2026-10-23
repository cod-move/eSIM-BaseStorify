import type { Language } from '@/contracts/mobile/biz/v1';

import { isRtlLocale, pickLocale } from '../locales';

const language = (code: string): Language => ({
  code,
  name: code,
  nativeName: code,
  direction: 'ltr',
});
const offered = [language('en'), language('bn'), language('ar')];

describe('pickLocale', () => {
  it("takes the first of the phone's languages the store offers", () => {
    expect(pickLocale(['fr-FR', 'bn-BD', 'en-US'], offered, 'en')).toBe('bn');
  });

  it('matches a regional variant to its language', () => {
    expect(pickLocale(['ar-EG'], offered, 'en')).toBe('ar');
  });

  it('prefers an exact match', () => {
    expect(pickLocale(['pt-BR'], [language('pt'), language('pt-BR')], 'en')).toBe('pt-BR');
  });

  it("uses the store's default when nothing matches", () => {
    expect(pickLocale(['ja-JP'], offered, 'en')).toBe('en');
  });
});

describe('isRtlLocale', () => {
  it('knows the right-to-left languages, with or without a region', () => {
    expect(isRtlLocale('ar')).toBe(true);
    expect(isRtlLocale('ar-SA')).toBe(true);
    expect(isRtlLocale('bn')).toBe(false);
  });
});
