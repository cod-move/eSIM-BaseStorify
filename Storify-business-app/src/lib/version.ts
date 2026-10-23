/**
 * Compares two app versions such as `1.4.0` and `1.10`, number by number.
 * Returns a negative number when `a` is older, a positive one when it is newer,
 * and 0 when they are the same. A part that is not a number counts as 0.
 */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(toNumber);
  const right = b.split('.').map(toNumber);

  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function toNumber(part: string): number {
  const value = Number.parseInt(part, 10);
  return Number.isFinite(value) ? value : 0;
}
