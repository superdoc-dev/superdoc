import { getMarksFromSelection } from '../helpers/getMarksFromSelection.js';

/**
 * Cascade-aware toggle for marks that may be provided by styles (e.g., rStyle in runProperties).
 *
 * Behavior:
 * - If a negation mark is active → remove it (turn ON again)
 * - Else if an inline mark is active → remove it (turn OFF)
 * - Else if style provides the effect → add a negation mark (turn OFF style)
 * - Else → add regular inline mark (turn ON)
 *
 * @param {string} markName
 * @param {{
 *   negationAttrs?: Object,
 *   isNegation?: (attrs:Object)=>boolean,
 *   styleDetector?: ({state: any, selectionMarks: any[], markName: string})=>boolean,
 *   extendEmptyMarkRange?: boolean,
 * }} [options]
 */
export const toggleMarkCascade =
  (markName, options = {}) =>
  ({ state, chain, editor }) => {
    const {
      negationAttrs = { value: '0' },
      isNegation = (attrs) => attrs?.value === '0',
      styleDetector = defaultStyleDetector,
      extendEmptyMarkRange = false,
    } = options;

    const selectionMarks = getMarksFromSelection(state) || [];
    const inlineMarks = selectionMarks.filter((m) => m.type?.name === markName);
    const hasNegation = inlineMarks.some((m) => isNegation(m.attrs || {}));
    const hasInline = inlineMarks.some((m) => !isNegation(m.attrs || {}));
    const styleOn = styleDetector({ state, selectionMarks, markName, editor });

    const cmdChain = chain();
    // 1) If negation already present, remove it (turn back ON)
    if (hasNegation) return cmdChain.unsetMark(markName, { extendEmptyMarkRange }).run();

    // 2) If inline is present and style is also ON, we must both remove inline AND add negation
    if (hasInline && styleOn) {
      return cmdChain
        .unsetMark(markName, { extendEmptyMarkRange })
        .setMark(markName, negationAttrs, { extendEmptyMarkRange })
        .run();
    }

    // 3) If only inline is present, remove it (turn OFF)
    if (hasInline) return cmdChain.unsetMark(markName, { extendEmptyMarkRange }).run();

    // 4) If only style is present, add negation (turn OFF)
    if (styleOn) return cmdChain.setMark(markName, negationAttrs, { extendEmptyMarkRange }).run();

    // 5) Neither inline nor style is present; turn ON inline
    return cmdChain.setMark(markName, {}, { extendEmptyMarkRange }).run();
  };

/**
 * Default style detector that checks run-level or paragraph-level styleId
 * @param {Object} params
 * @returns {boolean}
 */
export function defaultStyleDetector({ state, selectionMarks, markName, editor }) {
  try {
    const styleId = getEffectiveStyleId(state, selectionMarks);
    if (!styleId || !editor?.converter?.linkedStyles) return false;
    // Resolve styles with basedOn chain
    const styles = editor.converter.linkedStyles;
    const seen = new Set();
    let current = styleId;
    const key = mapMarkToStyleKey(markName);
    while (current && !seen.has(current)) {
      seen.add(current);
      const style = styles.find((s) => s.id === current);
      const def = style?.definition?.styles || {};
      if (key in def) {
        const raw = def[key];
        // Some style parsers set the key with undefined value to indicate presence (ON)
        if (raw === undefined) return true;
        const val = raw?.value ?? raw;
        return isStyleTokenEnabled(val);
      }
      current = style?.definition?.attrs?.basedOn || null;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Determines the effective style ID for the current selection/cursor position
 * by checking multiple sources in priority order.
 *
 * Priority hierarchy:
 * 1. Run-level rStyle from selection marks (highest priority)
 * 2. Cursor-adjacent node marks (handles boundaries where selection marks omit run mark)
 * 3. TextStyle styleId mark from selection marks
 * 4. Paragraph ancestor styleId (lowest priority)
 *
 * @param {Object} state - The ProseMirror editor state
 * @param {Array} selectionMarks - Array of marks from the current selection
 * @returns {string|null} The effective style ID, or null if none found
 */
export function getEffectiveStyleId(state, selectionMarks) {
  // 1) Run-level style resolved from the current mark set
  const sidFromMarks = getStyleIdFromMarks(selectionMarks);
  if (sidFromMarks) return sidFromMarks;

  // 2) Cursor-adjacent marks (handles cursor at text boundaries where selection marks omit run mark)
  const $from = state.selection.$from;
  const before = $from.nodeBefore;
  const after = $from.nodeAfter;
  if (before && before.marks) {
    const sid = getStyleIdFromMarks(before.marks);
    if (sid) return sid;
  }
  if (after && after.marks) {
    const sid = getStyleIdFromMarks(after.marks);
    if (sid) return sid;
  }

  // 3) TextStyle styleId mark
  const ts = selectionMarks.find((m) => m.type?.name === 'textStyle' && m.attrs?.styleId);
  if (ts) return ts.attrs.styleId;

  // 4) Paragraph ancestor styleId
  const pos = state.selection.$from.pos;
  const $pos = state.doc.resolve(pos);
  for (let d = $pos.depth; d >= 0; d--) {
    const n = $pos.node(d);
    if (n?.type?.name === 'paragraph') return n.attrs?.styleId || null;
  }
  return null;
}

/**
 * Get the style ID from an array of marks.
 * @param {import('prosemirror-model').Mark[]} marks
 * @returns {string|null}
 */
export function getStyleIdFromMarks(marks) {
  if (!Array.isArray(marks)) return null;

  const textStyleMark = marks.find((m) => m.type?.name === 'textStyle' && m.attrs?.styleId);
  if (textStyleMark) return textStyleMark.attrs.styleId;

  return null;
}

/**
 * Maps a mark name to its corresponding style key.
 * Special case: both 'textStyle' and 'color' marks map to the 'color' style key.
 * All other mark names map directly to themselves.
 *
 * @param {string} markName - The name of the mark to map
 * @returns {string} The corresponding style key
 */
export function mapMarkToStyleKey(markName) {
  if (markName === 'textStyle' || markName === 'color') return 'color';
  return markName;
}

export function isStyleTokenEnabled(val) {
  if (val === false || val === 0) return false;
  if (typeof val === 'string') {
    const normalized = val.trim().toLowerCase();
    if (!normalized) return false;
    if (['0', 'false', 'none', 'inherit', 'transparent'].includes(normalized)) return false;
    return true;
  }
  return !!val;
}
