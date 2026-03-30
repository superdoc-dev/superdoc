/**
 * Computes the Levenshtein edit distance between two strings.
 *
 * @param a First string.
 * @param b Second string.
 * @returns Minimum number of edits required to transform {@link a} into {@link b}.
 */
export function levenshteinDistance(a: string, b: string): number {
  const lenA = a.length;
  const lenB = b.length;

  if (lenA === 0) {
    return lenB;
  }
  if (lenB === 0) {
    return lenA;
  }

  let previous = new Array<number>(lenB + 1);
  let current = new Array<number>(lenB + 1);

  for (let j = 0; j <= lenB; j += 1) {
    previous[j] = j;
  }

  for (let i = 1; i <= lenA; i += 1) {
    current[0] = i;
    const charA = a[i - 1];

    for (let j = 1; j <= lenB; j += 1) {
      const charB = b[j - 1];
      const cost = charA === charB ? 0 : 1;
      const deletion = previous[j] + 1;
      const insertion = current[j - 1] + 1;
      const substitution = previous[j - 1] + cost;
      current[j] = Math.min(deletion, insertion, substitution);
    }

    [previous, current] = [current, previous];
  }

  return previous[lenB];
}
