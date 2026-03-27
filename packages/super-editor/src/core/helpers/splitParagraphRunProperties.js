import { decodeRPrFromMarks } from '@converter/styles.js';
import { normalizeRunProperties } from './normalizeRunProperties.js';

/**
 * Extracts runProperties from the cursor context.
 * When the cursor is directly inside a paragraph (not inside a run), it
 * looks at the node just before the cursor. For empty paragraphs, it falls
 * back to `paragraphProperties.runProperties`.
 *
 * @param {import('prosemirror-model').ResolvedPos} $from
 * @returns {Record<string, unknown> | null}
 */
export function getRunPropertiesAtCursor($from) {
  if ($from.parent?.type.name === 'run' && $from.parent.attrs?.runProperties) {
    return { ...$from.parent.attrs.runProperties };
  }

  const runNode = $from.nodeBefore;
  if (runNode?.type.name === 'run' && runNode.attrs.runProperties) {
    return { ...runNode.attrs.runProperties };
  }

  if ($from.parent?.type.name === 'paragraph' && $from.parent.content.size === 0) {
    const paragraphRunProperties = $from.parent.attrs?.paragraphProperties?.runProperties;
    if (paragraphRunProperties && typeof paragraphRunProperties === 'object') {
      return { ...paragraphRunProperties };
    }
  }

  return null;
}

/**
 * Resolves the inline formatting source to carry onto a newly split paragraph.
 * Explicit stored marks take precedence over inherited run-node formatting.
 *
 * @param {import('prosemirror-state').EditorState} state
 * @param {import('prosemirror-model').ResolvedPos} $from
 * @returns {Record<string, unknown> | null}
 */
export function getSplitRunProperties(state, $from) {
  if (state.storedMarks !== null) {
    return normalizeRunProperties(decodeRPrFromMarks(state.storedMarks));
  }

  return getRunPropertiesAtCursor($from);
}

/**
 * Sync paragraph-level runProperties for a newly split paragraph.
 *
 * @param {Record<string, any>} attrs
 * @param {Record<string, unknown> | null} runProperties
 * @returns {Record<string, any>}
 */
export function syncSplitParagraphRunProperties(attrs, runProperties) {
  const nextParagraphProperties = { ...(attrs.paragraphProperties || {}) };
  if (runProperties) {
    nextParagraphProperties.runProperties = { ...runProperties };
  } else {
    delete nextParagraphProperties.runProperties;
  }

  return {
    ...attrs,
    paragraphProperties: nextParagraphProperties,
  };
}
