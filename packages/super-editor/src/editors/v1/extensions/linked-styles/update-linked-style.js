// @ts-check
import { LinkedStylesPluginKey } from './plugin.js';
import {
  applyToDefinitionStyles,
  applyToTranslatedStyle,
  findStyleXmlElement,
  parseFontSizePt,
  patchStyleXmlElement,
  normaliseHex,
} from './style-formatting.js';

/** Deep-clone plain (JSON-serialisable) style data for snapshot/rollback. */
const cloneData = (value) => JSON.parse(JSON.stringify(value));

/**
 * Repaint after a style's definition was mutated in place. A redefinition does
 * not change the document, so the two render paths need distinct, non-document
 * signals (neither mutates nodes, so neither re-enters the command's dispatch):
 *
 *  - Plain ProseMirror mode: dispatch a stepless meta transaction; the
 *    linked-styles plugin regenerates its decorations from the updated styles.
 *  - Layout/presentation mode: PM decorations are unused (the layout engine
 *    paints from a FlowBlockCache keyed on node identity, which a definition
 *    change does not invalidate). Ask the PresentationEditor to clear that cache
 *    and re-render — the same mechanism used by other non-edit render changes
 *    (e.g. show-bookmarks). Both signals are safe to fire; the inactive path
 *    is a no-op. Never throws.
 * @param {Object} editor
 */
function repaintStyle(editor) {
  try {
    const view = editor?.view;
    if (view) view.dispatch(view.state.tr.setMeta(LinkedStylesPluginKey, { stylesChanged: true }));
  } catch {
    /* decoration repaint is best-effort */
  }
  try {
    editor?.presentationEditor?.refreshLinkedStyles?.();
  } catch {
    /* layout repaint is best-effort */
  }
}

/**
 * Redefine a named paragraph style's run-level look across all three converter
 * representations (live decoration source, translated layout, and the OOXML that
 * survives export) and repaint. Snapshots every representation it touches and
 * rolls all of them back on any failure. Never throws.
 * @param {Object} editor
 * @param {string} styleId
 * @param {import('./style-formatting.js').CapturedFormatting} formatting
 * @returns {boolean} true when the style was found and updated.
 */
export function updateLinkedStyleDefinition(editor, styleId, formatting) {
  try {
    const converter = editor?.converter;
    const linkedStyles = converter?.linkedStyles;
    if (!Array.isArray(linkedStyles) || !styleId) return false;
    const entry = linkedStyles.find((s) => String(s?.id) === String(styleId));
    if (!entry || entry.type !== 'paragraph') return false;

    if (!entry.definition) entry.definition = { attrs: {}, styles: {} };
    if (!entry.definition.styles) entry.definition.styles = {};

    const translatedStyles = converter?.translatedLinkedStyles?.styles;
    const stylesXml = converter?.convertedXml?.['word/styles.xml'];
    const xmlEl = findStyleXmlElement(stylesXml, styleId);

    const snapshot = {
      definitionStyles: cloneData(entry.definition.styles),
      translated: translatedStyles && styleId in translatedStyles ? cloneData(translatedStyles[styleId]) : undefined,
      xmlElements: xmlEl ? cloneData(xmlEl.elements ?? []) : undefined,
    };

    try {
      // 1. live decoration source
      applyToDefinitionStyles(entry.definition.styles, formatting);
      // 2. translated layout / resolution chain
      if (translatedStyles) {
        if (!translatedStyles[styleId]) translatedStyles[styleId] = { styleId, type: 'paragraph' };
        applyToTranslatedStyle(translatedStyles[styleId], formatting);
      }
      // 3. export survival
      if (xmlEl) patchStyleXmlElement(xmlEl, formatting);
      // 4. repaint both render paths (PM decorations + layout cache)
      repaintStyle(editor);
      return true;
    } catch {
      entry.definition.styles = snapshot.definitionStyles;
      if (translatedStyles && snapshot.translated !== undefined) translatedStyles[styleId] = snapshot.translated;
      if (xmlEl && snapshot.xmlElements !== undefined) xmlEl.elements = snapshot.xmlElements;
      return false;
    }
  } catch {
    return false;
  }
}

/**
 * Read the run formatting at the current selection from editor marks.
 * Never throws; returns a complete CapturedFormatting.
 * @param {Object} editor
 * @returns {import('./style-formatting.js').CapturedFormatting}
 */
export function readEffectiveRunFormatting(editor) {
  const isActive = (name) => {
    try {
      return Boolean(editor.isActive?.(name));
    } catch {
      return false;
    }
  };
  let textStyle = {};
  try {
    textStyle = editor.getAttributes?.('textStyle') ?? {};
  } catch {
    /* noop */
  }
  return {
    bold: isActive('bold'),
    italic: isActive('italic'),
    underline: isActive('underline'),
    fontSizePt: parseFontSizePt(textStyle.fontSize),
    fontFamily: typeof textStyle.fontFamily === 'string' ? textStyle.fontFamily : null,
    colorHex: normaliseHex(textStyle.color),
  };
}
