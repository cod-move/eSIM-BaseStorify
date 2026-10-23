import { useEffect, useState } from 'react';

/**
 * `value`, once it has stopped changing for `delayMs`: what a search field
 * asks the store for, so a word typed letter by letter is one request, not
 * one per letter. An empty value passes at once, so clearing a search shows
 * the whole list without waiting.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [settled, setSettled] = useState(value);
  const immediate = value === '' || value === null || value === undefined;

  // Cleared: at once, and the next word starts from nothing, not from the word before it.
  if (immediate && settled !== value) setSettled(value);

  useEffect(() => {
    if (immediate) return;
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs, immediate]);

  return immediate ? value : settled;
}
