import ar from '../messages/ar.json';
import bn from '../messages/bn.json';
import en from '../messages/en.json';

/**
 * UTF-8 read as Windows-1252 and written back turns "عرض" into "Ø¹Ø±Ø¶" and
 * "—" into "â€”": still valid ICU, so the message checks pass, and an
 * operator reads gibberish. Every string of every language is held to its
 * own characters.
 */
const GARBLED = /[ÃØÙÚÛà][\u0080-ÿŒ-™]|â€/;

function strings(node: unknown, path = ''): [string, string][] {
  if (typeof node === 'string') return [[path, node]];
  if (!node || typeof node !== 'object') return [];
  return Object.entries(node).flatMap(([key, value]) =>
    strings(value, path ? `${path}.${key}` : key)
  );
}

describe.each([
  ['en', en],
  ['ar', ar],
  ['bn', bn],
])('the %s messages', (_locale, messages) => {
  it('hold no text garbled by a Windows-1252 round trip', () => {
    const garbled = strings(messages)
      .filter(([, text]) => GARBLED.test(text))
      .map(([path]) => path);
    expect(garbled).toEqual([]);
  });
});
