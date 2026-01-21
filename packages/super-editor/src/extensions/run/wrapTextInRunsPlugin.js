import { Plugin, TextSelection } from 'prosemirror-state';
import { decodeRPrFromMarks, resolveRunProperties } from '@converter/styles.js';

const mergeRanges = (ranges, docSize) => {
  if (!ranges.length) return [];
  const sorted = ranges
    .map(({ from, to }) => ({
      from: Math.max(0, from),
      to: Math.min(docSize, to),
    }))
    .filter(({ from, to }) => from < to)
    .sort((a, b) => a.from - b.from);

  const merged = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.from <= last.to) {
      last.to = Math.max(last.to, range.to);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
};

const collectChangedRanges = (trs, docSize) => {
  const ranges = [];
  trs.forEach((tr) => {
    if (!tr.docChanged) return;
    tr.mapping.maps.forEach((map) => {
      map.forEach((oldStart, oldEnd, newStart, newEnd) => {
        if (newStart !== oldStart || oldEnd !== newEnd) {
          ranges.push({ from: newStart, to: newEnd });
        }
      });
    });
  });
  return mergeRanges(ranges, docSize);
};

const mapRangesThroughTransactions = (ranges, transactions, docSize) => {
  let mapped = ranges;
  transactions.forEach((tr) => {
    mapped = mapped
      .map(({ from, to }) => {
        const mappedFrom = tr.mapping.map(from, -1);
        const mappedTo = tr.mapping.map(to, 1);
        if (mappedFrom >= mappedTo) return null;
        return { from: mappedFrom, to: mappedTo };
      })
      .filter(Boolean);
  });
  return mergeRanges(mapped, docSize);
};

const getParagraphAtPos = (doc, pos) => {
  try {
    const $pos = doc.resolve(pos);
    for (let depth = $pos.depth; depth >= 0; depth--) {
      const node = $pos.node(depth);
      if (node.type.name === 'paragraph') {
        return node;
      }
    }
  } catch (_e) {
    /* ignore invalid positions */
  }
  return null;
};

/**
 * Resolves run properties from a paragraph's style definition.
 * Extracts character-level formatting (fonts, sizes, bold, italic, etc.) that should
 * apply to text within the paragraph based on the paragraph's styleId.
 *
 * @param {Object | null} paragraphNode - The ProseMirror paragraph node containing style information.
 * @param {Object} paragraphNode.attrs - Node attributes.
 * @param {Object} [paragraphNode.attrs.paragraphProperties] - Paragraph properties object.
 * @param {string} [paragraphNode.attrs.paragraphProperties.styleId] - The paragraph style ID to resolve.
 * @param {Object} editor - The editor instance containing the converter.
 * @param {Object} editor.converter - The DOCX converter instance with style data.
 * @param {Object} editor.converter.convertedXml - The parsed DOCX XML structure for theme/font lookups.
 * @param {Object} editor.converter.numbering - The numbering definitions from DOCX.
 * @returns {Object} Simplified run properties object with character-level formatting.
 * @returns {string} [return.fontFamily] - Resolved font family name (extracted from complex font object).
 * @returns {string} [return.fontSize] - Font size in points (e.g., "12pt").
 * @returns {boolean} [return.bold] - Whether text should be bold.
 * @returns {boolean} [return.italic] - Whether text should be italic.
 * @returns {Object} [return.underline] - Underline properties from DOCX (contains w:val, w:color).
 * @returns {boolean} [return.strike] - Whether text should be struck through.
 *
 * @remarks
 * Font family extraction handles two cases:
 * 1. Complex font objects with 'ascii' property: extracts the ascii value
 * 2. Simple string values: uses the string directly
 * 3. Nested objects: attempts to extract 'ascii' property from the fontValue
 *
 * Font size conversion: DOCX uses half-points, so we divide by 2 to get points.
 *
 * Error handling: Returns empty object on any failure to prevent crashes during typing.
 * This allows the plugin to gracefully degrade when converter data is unavailable.
 */
const resolveRunPropertiesFromParagraphStyle = (paragraphNode, editor) => {
  if (!paragraphNode || !editor?.converter) return {};

  const styleId = paragraphNode.attrs?.paragraphProperties?.styleId;
  if (!styleId) return {};

  try {
    const params = {
      translatedNumbering: editor.converter.translatedNumbering,
      translatedLinkedStyles: editor.converter.translatedLinkedStyles,
    };
    const resolvedPpr = { styleId };
    const runProps = resolveRunProperties(params, {}, resolvedPpr, false, false);

    const runProperties = {};
    if (runProps.fontFamily) {
      const fontValue = runProps.fontFamily.ascii || runProps.fontFamily;
      if (fontValue) {
        runProperties.fontFamily = typeof fontValue === 'string' ? fontValue : fontValue.ascii;
      }
    }
    if (runProps.fontSize) {
      runProperties.fontSize = `${runProps.fontSize / 2}pt`;
    }
    if (runProps.bold) runProperties.bold = true;
    if (runProps.italic) runProperties.italic = true;
    if (runProps.underline) runProperties.underline = runProps.underline;
    if (runProps.strike) runProperties.strike = true;

    return runProperties;
  } catch (_e) {
    return {};
  }
};

const createMarksFromDefs = (schema, markDefs = []) =>
  markDefs
    .map((def) => {
      const markType = schema.marks[def.type];
      return markType ? markType.create(def.attrs) : null;
    })
    .filter(Boolean);

/**
 * Creates mark definitions from pre-converted style run properties.
 * This is used when we already have CSS-formatted values (e.g., fontSize: "12pt")
 * and need to create marks without going through encodeMarksFromRPr which expects
 * raw OOXML values.
 *
 * @param {Object} styleRunProps - Pre-converted run properties from resolveRunPropertiesFromParagraphStyle
 * @returns {Array<Object>} Mark definitions ready for createMarksFromDefs
 */
const createMarkDefsFromStyleRunProps = (styleRunProps) => {
  const markDefs = [];
  const textStyleAttrs = {};

  if (styleRunProps.fontSize) {
    textStyleAttrs.fontSize = styleRunProps.fontSize;
  }
  if (styleRunProps.fontFamily) {
    textStyleAttrs.fontFamily = styleRunProps.fontFamily;
  }

  if (Object.keys(textStyleAttrs).length > 0) {
    markDefs.push({ type: 'textStyle', attrs: textStyleAttrs });
  }

  if (styleRunProps.bold) {
    markDefs.push({ type: 'bold', attrs: { value: true } });
  }
  if (styleRunProps.italic) {
    markDefs.push({ type: 'italic', attrs: { value: true } });
  }
  if (styleRunProps.strike) {
    markDefs.push({ type: 'strike', attrs: { value: true } });
  }
  if (styleRunProps.underline) {
    const underlineType = styleRunProps.underline['w:val'];
    if (underlineType) {
      let underlineColor = styleRunProps.underline['w:color'];
      if (underlineColor && underlineColor.toLowerCase() !== 'auto' && !underlineColor.startsWith('#')) {
        underlineColor = `#${underlineColor}`;
      }
      markDefs.push({
        type: 'underline',
        attrs: { underlineType, underlineColor },
      });
    }
  }

  return markDefs;
};

// Keep collapsed selections inside run nodes so caret geometry maps to text positions.
const normalizeSelectionIntoRun = (tr, runType) => {
  const selection = tr.selection;
  if (!(selection instanceof TextSelection)) return;
  if (selection.from !== selection.to) return;
  const $pos = tr.doc.resolve(selection.from);
  if ($pos.parent.type === runType) return;

  const nodeAfter = $pos.nodeAfter;
  if (nodeAfter?.type === runType && nodeAfter.content.size > 0) {
    const nextPos = selection.from + 1;
    if (nextPos <= tr.doc.content.size) {
      tr.setSelection(TextSelection.create(tr.doc, nextPos));
    }
    return;
  }

  const nodeBefore = $pos.nodeBefore;
  if (nodeBefore?.type === runType && nodeBefore.content.size > 0) {
    const prevPos = selection.from - 1;
    if (prevPos >= 0) {
      tr.setSelection(TextSelection.create(tr.doc, prevPos));
    }
  }
};

const buildWrapTransaction = (state, ranges, runType, editor, markDefsFromMeta = []) => {
  if (!ranges.length) return null;

  const replacements = [];
  const metaStyleMarks = createMarksFromDefs(state.schema, markDefsFromMeta);

  ranges.forEach(({ from, to }) => {
    state.doc.nodesBetween(from, to, (node, pos, parent, index) => {
      if (!node.isText || !parent || parent.type === runType) return;

      const match = parent.contentMatchAt ? parent.contentMatchAt(index) : null;
      if (match && !match.matchType(runType)) return;
      if (!match && !parent.type.contentMatch.matchType(runType)) return;

      let runProperties = decodeRPrFromMarks(node.marks);

      if ((!node.marks || node.marks.length === 0) && editor?.converter) {
        const paragraphNode = getParagraphAtPos(state.doc, pos);
        const styleRunProps = resolveRunPropertiesFromParagraphStyle(paragraphNode, editor);
        if (Object.keys(styleRunProps).length > 0) {
          runProperties = styleRunProps;
          // Use metaStyleMarks if available, otherwise create marks from pre-converted style properties
          const markDefs = metaStyleMarks.length ? markDefsFromMeta : createMarkDefsFromStyleRunProps(styleRunProps);
          const styleMarks = metaStyleMarks.length ? metaStyleMarks : createMarksFromDefs(state.schema, markDefs);
          if (styleMarks.length && typeof state.schema.text === 'function') {
            const textNode = state.schema.text(node.text || '', styleMarks);
            if (textNode) {
              node = textNode;
            }
          }
        }
      }

      const runNode = runType.create({ runProperties }, node);
      replacements.push({ from: pos, to: pos + node.nodeSize, runNode });
    });
  });

  if (!replacements.length) return null;

  const tr = state.tr;
  replacements.sort((a, b) => b.from - a.from).forEach(({ from, to, runNode }) => tr.replaceWith(from, to, runNode));
  normalizeSelectionIntoRun(tr, runType);

  return tr.docChanged ? tr : null;
};

export const wrapTextInRunsPlugin = (editor) => {
  let view = null;
  let pendingRanges = [];
  let lastStyleMarksMeta = [];

  const flush = () => {
    if (!view) return;
    const runType = view.state.schema.nodes.run;
    if (!runType) {
      pendingRanges = [];
      return;
    }
    const tr = buildWrapTransaction(view.state, pendingRanges, runType, editor, lastStyleMarksMeta);
    pendingRanges = [];
    if (tr) {
      view.dispatch(tr);
    }
  };

  const onCompositionEnd = () => {
    if (typeof globalThis === 'undefined') return;
    globalThis.queueMicrotask(flush);
  };

  return new Plugin({
    view(editorView) {
      view = editorView;
      editorView.dom.addEventListener('compositionend', onCompositionEnd);
      return {
        destroy() {
          editorView.dom.removeEventListener('compositionend', onCompositionEnd);
          view = null;
          pendingRanges = [];
          lastStyleMarksMeta = [];
        },
      };
    },

    appendTransaction(transactions, _oldState, newState) {
      const docSize = newState.doc.content.size;
      const runType = newState.schema.nodes.run;
      if (!runType) return null;

      pendingRanges = mapRangesThroughTransactions(pendingRanges, transactions, docSize);
      const changedRanges = collectChangedRanges(transactions, docSize);
      pendingRanges = mergeRanges([...pendingRanges, ...changedRanges], docSize);

      if (view?.composing) {
        return null;
      }

      const latestStyleMarksMeta =
        [...transactions]
          .reverse()
          .find((tr) => tr.getMeta && tr.getMeta('sdStyleMarks'))
          ?.getMeta('sdStyleMarks') || lastStyleMarksMeta;
      if (latestStyleMarksMeta && latestStyleMarksMeta.length) {
        lastStyleMarksMeta = latestStyleMarksMeta;
      }

      const tr = buildWrapTransaction(newState, pendingRanges, runType, editor, latestStyleMarksMeta);
      pendingRanges = [];
      return tr;
    },
  });
};
