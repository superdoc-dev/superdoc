/**
 * Pure typeahead/autocomplete helpers for the font-family combobox.
 *
 * Matching is case-insensitive prefix matching on the logical font labels.
 * Space is a normal query character, so the query is never split on spaces;
 * only the outer whitespace is ignored when comparing.
 *
 * These functions hold no Vue or DOM state so CI can unit-test them in isolation.
 */

const normalize = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase();

/**
 * Index of the first label that starts with `query` (case-insensitive).
 * An empty/whitespace query never matches.
 *
 * @param {string} query
 * @param {ReadonlyArray<string>} labels
 * @returns {number} matching index or -1
 */
export const findPrefixMatchIndex = (query, labels) => {
  const q = normalize(query);
  if (!q) return -1;
  for (let i = 0; i < labels.length; i += 1) {
    if (normalize(labels[i]).startsWith(q)) return i;
  }
  return -1;
};

/**
 * Resolve what the input should display after a keystroke.
 *
 * When `autocomplete` is true and a prefix match exists that is longer than the
 * typed query, the completion is shown with the suffix selected so the next
 * keystroke replaces it. When false (deletion) or no match exists, the raw
 * query is shown with the caret at its end.
 *
 * @param {string} query - the user-typed portion
 * @param {ReadonlyArray<string>} labels
 * @param {{ autocomplete?: boolean }} [options]
 * @returns {{ matchIndex: number, display: string, selectionStart: number, selectionEnd: number }}
 */
export const computeTypeahead = (query, labels, { autocomplete = true } = {}) => {
  const typed = String(query ?? '');
  const matchIndex = findPrefixMatchIndex(typed, labels);
  const completion = matchIndex >= 0 ? String(labels[matchIndex] ?? '') : '';

  if (autocomplete && matchIndex >= 0 && completion.length > typed.length) {
    return {
      matchIndex,
      display: completion,
      selectionStart: typed.length,
      selectionEnd: completion.length,
    };
  }

  return {
    matchIndex,
    display: typed,
    selectionStart: typed.length,
    selectionEnd: typed.length,
  };
};

const stripWrappingQuotes = (value) => {
  let result = String(value ?? '').trim();
  while (
    result.length >= 2 &&
    ((result.startsWith('"') && result.endsWith('"')) || (result.startsWith("'") && result.endsWith("'")))
  ) {
    result = result.slice(1, -1).trim();
  }
  return result;
};

export const normalizeCustomFontFamily = (value) => {
  const firstFamily = String(value ?? '').split(',')[0] ?? '';
  const withoutControls = firstFamily.replace(/[\u0000-\u001f\u007f]/g, '');
  return stripWrappingQuotes(withoutControls).replace(/\s+/g, ' ').trim();
};
