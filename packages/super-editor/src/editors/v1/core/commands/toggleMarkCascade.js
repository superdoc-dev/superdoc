import { getSelectionFormattingState } from '../helpers/getMarksFromSelection.js';

/**
 * Cascade-aware toggle for marks that may be provided by styles.
 *
 * Behavior:
 * - If a negation mark is active → remove it (turn ON again)
 * - Else if direct inline formatting is active and style is also ON → remove inline and add negation
 * - Else if only direct inline formatting is active → remove it (turn OFF)
 * - Else if only style provides the effect → add a negation mark (turn OFF style)
 * - Else → add regular inline mark (turn ON)
 *
 * @param {string} markName
 * @param {{
 *   negationAttrs?: Object,
 *   isNegation?: (attrs:Object)=>boolean,
 *   extendEmptyMarkRange?: boolean,
 * }} [options]
 */
export const toggleMarkCascade =
  (markName, options = {}) =>
  ({ state, chain, editor }) => {
    const {
      negationAttrs = { value: '0' },
      isNegation = (attrs) => attrs?.value === '0' || attrs?.value === false,
      extendEmptyMarkRange = false,
    } = options;

    const formattingState = getSelectionFormattingState(state, editor);
    const directMarksForType = (formattingState?.inlineMarks || []).filter((m) => m.type?.name === markName);
    const hasNegation = directMarksForType.some((m) => isNegation(m.attrs || {}));
    const hasInline = directMarksForType.some((m) => !isNegation(m.attrs || {}));
    const styleValue = formattingState?.styleRunProperties?.[markName];
    const styleOn = isRunPropertyEnabled(styleValue);

    const cmdChain = chain();
    if (hasNegation) return cmdChain.unsetMark(markName, { extendEmptyMarkRange }).run();

    if (hasInline && styleOn) {
      return cmdChain
        .unsetMark(markName, { extendEmptyMarkRange })
        .setMark(markName, negationAttrs, { extendEmptyMarkRange })
        .run();
    }

    if (hasInline) return cmdChain.unsetMark(markName, { extendEmptyMarkRange }).run();
    if (styleOn) return cmdChain.setMark(markName, negationAttrs, { extendEmptyMarkRange }).run();

    return cmdChain.setMark(markName, {}, { extendEmptyMarkRange }).run();
  };

function isRunPropertyEnabled(value) {
  if (value == null) return false;
  if (typeof value === 'object') {
    if ('w:val' in value) {
      return isStyleTokenEnabled(value['w:val']);
    }
    if ('val' in value) {
      return isStyleTokenEnabled(value.val);
    }
  }
  return isStyleTokenEnabled(value);
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
