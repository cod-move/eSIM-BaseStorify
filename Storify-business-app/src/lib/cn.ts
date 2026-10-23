import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// The app's own radius and shadow names (src/global.css), so that a later
// `rounded-sheet` replaces an earlier `rounded-xl` instead of sitting beside it.
const merge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ['sheet'],
      shadow: ['float', 'bar', 'button', 'card'],
    },
  },
});

/**
 * Joins class names, and lets a later one win over an earlier one that sets the
 * same thing: `cn('p-4', condition && 'p-2')` is `p-2` when the condition holds.
 * A component that accepts a `className` passes it last, so its caller can
 * override what the component sets itself.
 */
export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}
