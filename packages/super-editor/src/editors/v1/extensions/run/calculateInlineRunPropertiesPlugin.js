import { Plugin, TextSelection } from 'prosemirror-state';
import { Fragment } from 'prosemirror-model';
import { TableMap } from 'prosemirror-tables';
import { decodeRPrFromMarks, encodeMarksFromRPr, resolveRunProperties } from '@converter/styles.js';
import { FONT_SLOT_THEME_PAIRS } from '@superdoc/style-engine/ooxml';
import {
  calculateResolvedParagraphProperties,
  getResolvedParagraphProperties,
} from '@extensions/paragraph/resolvedPropertiesCache.js';
import { collectChangedRangesThroughTransactions } from '@utils/rangeUtils.js';

// SD-2912: `boldCs` / `italicCs` are NOT marks. The OOXML companions for complex-script
// bold/italic are independent properties (ECMA-376 §17.3.2.1, §17.3.2.16) carried by the
// run's stored runProperties. Listing them here caused the plugin to overwrite their
// preserved value on every appendTransaction, which combined with the auto-propagation in
// `decodeRPrFromMarks` injected a `<w:bCs/>` / `<w:iCs/>` element into every run on round-
// trip even when the source rPr had none. Keeping them out of this set lets the existing-
// runProperties branch in `getInlineRunProperties` preserve them verbatim.
const RUN_PROPERTIES_DERIVED_FROM_MARKS = new Set([
  'strike',
  'italic',
  'bold',
  'underline',
  'highlight',
  'textTransform',
  'color',
  'fontSize',
  'fontSizeCs',
  'letterSpacing',
  'fontFamily',
  'vertAlign',
  'position',
]);

export const TRANSIENT_HYPERLINK_STYLE_IDS = new Set(['Hyperlink', 'FollowedHyperlink']);

/**
 * Merge mark-derived concrete fontFamily slots with theme references preserved on the
 * existing run. For each slot where the existing fontFamily has a theme reference, keep
 * the theme and drop the concrete value from marks; otherwise take the mark value.
 *
 * Only safe to call when the caller has already verified that marks are a re-derivation
 * of `existing` rather than a user override — otherwise this silently reverts user font
 * changes. See `marksMatchExistingFontFamily` for the gate.
 *
 * SD-2894: when the plugin overrides a run's fontFamily from mark-derived values, the
 * mark only carries the resolved CSS font name (`ascii: "Calibri Light"`) and forgets the
 * theme reference (`asciiTheme: "majorBidi"`) that came from the imported `<w:rFonts>`.
 * Without this merge we'd export concrete font names that defeat Word's per-script theme
 * resolution.
 *
 * AIDEV-NOTE: The gate + merge pair operate at the fontFamily-key level (whole rPr
 * fontFamily object), not at the per-slot level. A user action that mutates only a
 * per-script mark attr (`eastAsiaFontFamily` or `csFontFamily`) without changing the
 * primary `fontFamily` will pass the gate, and this merge will silently restore the
 * stale theme on that slot. We accept this trade-off because (a) the toolbar's
 * setFontFamily writes all four slots to the same family, so a real user override
 * always changes the primary; (b) no current API or paste path produces per-script-only
 * mark changes against an imported theme run; (c) a per-slot model adds intricate
 * encoder probes that risk regressing the SD-2894 customer fixture again (see commit
 * bec7e63ed for the prior per-script regression we just fixed). If a real customer
 * reproduction surfaces — e.g. a paste-from-Word flow with per-script fonts being
 * silently reverted — file a follow-up ticket with that fixture and rework this helper
 * into a per-slot decision then. Codex flagged this on the PR-3225 review.
 *
 * @param {Record<string, unknown>|null|undefined} fromMarks
 * @param {Record<string, unknown>|null|undefined} existing
 * @returns {Record<string, unknown>}
 */
function mergeFontFamilyPreservingThemeRefs(fromMarks, existing) {
  const merged = { ...(fromMarks || {}) };
  if (!existing || typeof existing !== 'object') return merged;
  for (const [concreteKey, themeKey] of FONT_SLOT_THEME_PAIRS) {
    if (existing[themeKey] != null) {
      merged[themeKey] = existing[themeKey];
      delete merged[concreteKey];
    }
  }
  return merged;
}

/**
 * True when the mark-derived fontFamily value encodes to the same primary ASCII font as
 * the run's existing (imported) fontFamily — i.e., marks are a faithful re-derivation,
 * not a user override.
 *
 * The encoder resolves theme references to their CSS font name. So:
 *   - import case: existing = { asciiTheme: 'majorBidi' }, marks = { ascii: 'Calibri Light' }
 *     → both encode to fontFamily: 'Calibri Light' → match → preserve theme.
 *   - user-edit case: existing = { asciiTheme: 'majorBidi' }, marks = { ascii: 'Arial' }
 *     → existing encodes to 'Calibri Light', marks encode to 'Arial' → mismatch → user
 *       has overridden, drop the theme and respect the new value.
 *
 * Compare ONLY the primary `fontFamily` attr, not the full mark attrs object. Per-script
 * extras (`csFontFamily`, `eastAsiaFontFamily`) on the mark are derived only when the
 * input has a *concrete* per-script slot. Existing run-props can carry mixed shapes
 * (e.g. `{ asciiTheme, hAnsiTheme, cstheme, eastAsia: 'Arial' }`) that encode without
 * `csFontFamily` while the mark re-decode adds a concrete `cs` and therefore does
 * include it. A full-attrs JSON compare would falsely flag this as user override and
 * drop the theme — the regression caught on the SD-2894 customer fixture round-trip.
 *
 * @param {{ attrs?: Record<string, unknown> } | null | undefined} markFromMarks
 * @param {Record<string, unknown>|null|undefined} existingFontFamily
 * @param {(props: Record<string, unknown>, docx: Record<string, unknown>) => Array<{ attrs?: Record<string, unknown> }>} encode
 * @param {Record<string, unknown>} docx
 * @returns {boolean}
 */
function marksMatchExistingFontFamily(markFromMarks, existingFontFamily, encode, docx) {
  if (!existingFontFamily || typeof existingFontFamily !== 'object') return false;
  if (!markFromMarks?.attrs) return false;
  const markFromExisting = encode({ fontFamily: existingFontFamily }, docx)?.[0];
  if (!markFromExisting?.attrs) return false;
  return markFromMarks.attrs.fontFamily === markFromExisting.attrs.fontFamily;
}

const RUN_PROPERTY_PRESERVE_META_KEY = 'sdPreserveRunPropertiesKeys';
const COMPANION_INLINE_KEYS = {
  fontSizeCs: 'fontSize',
  boldCs: 'bold',
  italicCs: 'italic',
};

/**
 * ProseMirror plugin that recalculates inline `runProperties` for changed runs,
 * keeping run attributes aligned with decoded mark styles and resolved paragraph styles.
 *
 * @param {object} editor Editor instance containing schema, converter data, and paragraph helpers.
 * @returns {Plugin} Plugin that updates run node attributes when changed runs are re-evaluated.
 */
export const calculateInlineRunPropertiesPlugin = (editor) =>
  new Plugin({
    /**
     * Recompute inline run properties and split runs when adjacent text carries different inline overrides.
     *
     * @param {import('prosemirror-state').Transaction[]} transactions
     * @param {import('prosemirror-state').EditorState} _oldState
     * @param {import('prosemirror-state').EditorState} newState
     * @returns {import('prosemirror-state').Transaction|null}
     */
    appendTransaction(transactions, _oldState, newState) {
      const tr = newState.tr;
      if (!transactions.some((t) => t.docChanged)) return null;

      const runType = newState.schema.nodes.run;
      if (!runType) return null;

      // Collect keys the user (or accept/reject) explicitly removed in this batch so the
      // SD-2517 lost-keys preservation below doesn't re-apply their stale run.runProperties.
      // - standalone marks (bold, italic, …): the mark's type name is the key.
      // - textStyle: each truthy attr on the removed mark is a key (fontFamily, color, …).
      const removedKeys = new Set();
      transactions.forEach((t) => {
        t.steps.forEach((step) => {
          const jsonStep = step.toJSON?.();
          if (jsonStep?.stepType !== 'removeMark' || !jsonStep.mark?.type) return;
          if (jsonStep.mark.type === 'textStyle') {
            Object.entries(jsonStep.mark.attrs || {}).forEach(([key, value]) => {
              if (value != null) removedKeys.add(key);
            });
          } else {
            removedKeys.add(jsonStep.mark.type);
          }
        });
      });

      const preservedDerivedKeys = new Set();
      const preferExistingKeys = new Set();
      transactions.forEach((transaction) => {
        const entries = transaction.getMeta(RUN_PROPERTY_PRESERVE_META_KEY);
        if (!Array.isArray(entries)) return;
        entries.forEach((entry) => {
          if (typeof entry === 'string' && entry.length > 0) {
            preservedDerivedKeys.add(entry);
          } else if (entry && typeof entry === 'object' && typeof entry.key === 'string') {
            preservedDerivedKeys.add(entry.key);
            if (entry.preferExisting) preferExistingKeys.add(entry.key);
          }
        });
      });

      // Find all runs affected by changes, regardless of step type
      const changedRanges = collectChangedRangesThroughTransactions(transactions, newState.doc.content.size);

      const runPositions = new Set();
      changedRanges.forEach(({ from, to }) => {
        newState.doc.nodesBetween(from, to, (node, pos) => {
          if (node.type === runType) runPositions.add(pos);
        });
      });

      if (!runPositions.size) return null;

      const selectionPreserver = createSelectionPreserver(tr, newState.selection, newState.storedMarks);
      const sortedRunPositions = Array.from(runPositions).sort((a, b) => b - a);

      sortedRunPositions.forEach((pos) => {
        const mappedPos = tr.mapping.map(pos);
        const runNode = tr.doc.nodeAt(mappedPos);
        if (!runNode || runNode.type !== runType) return;

        const $pos = tr.doc.resolve(mappedPos);
        const { paragraphNode, paragraphPos, tableInfo } = getRunContext($pos);
        if (!paragraphNode || paragraphPos === undefined) return;

        const { segments, firstInlineProps } = segmentRunByInlineProps(
          runNode,
          paragraphNode,
          tableInfo,
          $pos,
          editor,
          removedKeys,
          preservedDerivedKeys,
          preferExistingKeys,
        );
        let runProperties = firstInlineProps ?? null;

        const existingInlineKeys = runNode.attrs?.runPropertiesInlineKeys || [];
        // [] means "importer explicitly found nothing inline"; null means "no metadata" (legacy).
        // The exporter treats null as "export all keys" for backward compat, so [] must be preserved.
        const hadInlineKeysMetadata = Array.isArray(runNode.attrs?.runPropertiesInlineKeys);
        const styleKeys = runNode.attrs?.runPropertiesStyleKeys || [];
        const existingStyleComparableProps = resolveRunProperties(
          {
            translatedNumbering: editor.converter?.translatedNumbering ?? {},
            translatedLinkedStyles: editor.converter?.translatedLinkedStyles ?? {},
          },
          runNode.attrs?.runProperties?.styleId != null ? { styleId: runNode.attrs.runProperties.styleId } : {},
          getResolvedParagraphProperties(paragraphNode) ||
            calculateResolvedParagraphProperties(editor, paragraphNode, $pos),
          tableInfo,
          false,
          Boolean(paragraphNode.attrs.paragraphProperties?.numberingProperties),
        );
        const keysFromMarks = (segment) => {
          const textNode = segment.content?.find((n) => n.isText);
          return Object.keys(decodeRPrFromMarks(textNode?.marks || []));
        };
        // AIDEV-NOTE: A style-defined key counts as an override only when the inline
        // value actually differs from the style-provided value. The simpler check
        // `k in inlineProps` looks correct but is wrong: cascade resolution puts every
        // styled key into inlineProps, so a run that just references a style (e.g.
        // <w:rStyle w:val="RtlChar"/>) gets every key tagged as an override. r-translator's
        // export gate then writes them inline, flattening style-inherited formatting onto
        // every run.
        const overrideKeysFromInlineProps = (inlineProps) =>
          styleKeys.filter((k) => {
            if (!inlineProps || !(k in inlineProps)) return false;
            if (!existingStyleComparableProps || !(k in existingStyleComparableProps)) return true;
            return JSON.stringify(inlineProps[k]) !== JSON.stringify(existingStyleComparableProps[k]);
          });

        // When the importer set an empty inline keys list ([]), it means the original run
        // had no inline w:rPr — all properties are style-inherited. Preserve that decision
        // unless the user has genuinely added new formatting (detected by new keys appearing
        // in computed inline props that weren't in the previous run properties).
        //
        // Without this guard, mark-derived keys (e.g. fontFamily from paragraph style) get
        // added to the allow-list. Marks lose per-script fidelity through the round-trip
        // (eastAsia/cs get flattened to the ascii font), causing the exporter to emit inline
        // w:rPr that breaks style inheritance in Word. (SD-2517 / IT-907)
        const existingRunPropsKeys = new Set(
          runNode.attrs?.runProperties ? Object.keys(runNode.attrs.runProperties) : [],
        );

        /**
         * Compute inline keys for a segment, respecting the [] vs null distinction.
         * @param {Record<string, any>|null} segmentInlineProps - Computed inline props for this segment
         * @param {{ content: import('prosemirror-model').Node[] }} segment - The segment to extract mark keys from
         * @returns {{ inlineKeys: string[]|null, overrideKeys: string[]|null }}
         */
        const computeSegmentKeys = (segmentInlineProps, segment) => {
          // Detect genuinely new inline properties (user-applied formatting, not just
          // recomputation artifacts from mark round-trip fidelity loss).
          const hasNewInlineProps =
            segmentInlineProps != null &&
            Object.keys(segmentInlineProps).some((k) => {
              if (existingRunPropsKeys.has(k)) return false;
              const baseKey = COMPANION_INLINE_KEYS[k];
              if (baseKey && existingRunPropsKeys.has(baseKey)) return false;
              return true;
            });
          const hasChangedStyleComparableProps =
            segmentInlineProps != null &&
            Object.keys(segmentInlineProps).some((k) => {
              if (!styleKeys.includes(k)) return false;
              const current = segmentInlineProps[k];
              const fromStyle = existingStyleComparableProps?.[k];
              if (JSON.stringify(current) !== JSON.stringify(fromStyle)) return true;
              const baseKey = COMPANION_INLINE_KEYS[k];
              if (!baseKey) return false;
              const currentBase = segmentInlineProps[baseKey];
              const styleBase = existingStyleComparableProps?.[baseKey];
              return JSON.stringify(currentBase) !== JSON.stringify(styleBase);
            });
          const shouldAddMarkKeys =
            !hadInlineKeysMetadata ||
            existingInlineKeys.length > 0 ||
            hasNewInlineProps ||
            hasChangedStyleComparableProps;
          const markKeysToAdd = shouldAddMarkKeys ? keysFromMarks(segment) : [];
          const keys = [...new Set([...existingInlineKeys, ...markKeysToAdd])];
          const ok = overrideKeysFromInlineProps(segmentInlineProps);
          return {
            inlineKeys: keys.length ? keys : hadInlineKeysMetadata ? [] : null,
            overrideKeys: ok?.length ? ok : null,
          };
        };

        if (segments.length === 1) {
          const hadInlineKeys =
            Array.isArray(runNode.attrs?.runPropertiesInlineKeys) && runNode.attrs.runPropertiesInlineKeys.length > 0;
          if (JSON.stringify(runProperties) === JSON.stringify(runNode.attrs.runProperties) && hadInlineKeys) return;
          // When the importer set non-empty inline keys and the computed inline props
          // dropped some of those keys (e.g. fontFamily "matches" the style due to
          // mark round-trip comparison), preserve the original keys. The importer saw
          // explicit w:rPr in the XML and that decision is authoritative. (SD-2517)
          //
          // Skip per-key when this batch removed that exact key (toggleItalic off,
          // reject of a fontFamily suggestion, etc.) — otherwise we'd re-apply a stale
          // value the user just asked us to drop. Unrelated inline keys on the same run
          // are left alone so imported w:rPr still survives accept/reject round-trips.
          if (hadInlineKeys) {
            const computedKeys = new Set(runProperties ? Object.keys(runProperties) : []);
            const lostKeys = existingInlineKeys.filter((k) => !computedKeys.has(k));
            if (lostKeys.length > 0) {
              if (!runProperties) runProperties = {};
              lostKeys.forEach((k) => {
                if (removedKeys.has(k)) return;
                const baseKey = COMPANION_INLINE_KEYS[k];
                if (baseKey && removedKeys.has(baseKey)) return;
                if (runNode.attrs?.runProperties?.[k] !== undefined) {
                  runProperties[k] = runNode.attrs.runProperties[k];
                }
              });
              if (runProperties && Object.keys(runProperties).length === 0) runProperties = null;
            }
          }
          const { inlineKeys: newInlineKeys, overrideKeys: newOverrideKeys } = computeSegmentKeys(
            runProperties,
            segments[0],
          );
          tr.setNodeMarkup(
            mappedPos,
            runNode.type,
            {
              ...runNode.attrs,
              runProperties,
              runPropertiesInlineKeys: newInlineKeys,
              runPropertiesOverrideKeys: newOverrideKeys,
            },
            runNode.marks,
          );
        } else {
          const newRuns = segments.map((segment) => {
            const props = segment.inlineProps ?? null;
            const { inlineKeys: segInlineKeys, overrideKeys: segOverrideKeys } = computeSegmentKeys(props, segment);
            return runType.create(
              {
                ...(runNode.attrs ?? {}),
                runProperties: props,
                runPropertiesInlineKeys: segInlineKeys,
                runPropertiesOverrideKeys: segOverrideKeys,
              },
              Fragment.fromArray(segment.content),
              runNode.marks,
            );
          });
          const replacement = Fragment.fromArray(newRuns);
          tr.replaceWith(mappedPos, mappedPos + runNode.nodeSize, replacement);

          selectionPreserver?.mapReplacement(mappedPos, runNode.nodeSize, replacement);
        }
      });

      selectionPreserver?.finalize();

      return tr.docChanged ? tr : null;
    },
  });

/**
 * Find paragraph and table context for a resolved position.
 *
 * @param {import('prosemirror-model').ResolvedPos} $pos
 * @returns {{
 *   paragraphNode?: import('prosemirror-model').Node,
 *   paragraphPos?: number,
 *   tableInfo?: {
 *     tableProperties: Record<string, any>|null,
 *     rowIndex: number,
 *     cellIndex: number,
 *     numCells: number,
 *     numRows: number,
 *   }|null,
 * }}
 */
function getRunContext($pos) {
  let paragraphNode = null;
  let paragraphDepth = -1;
  let tableInfo = null;

  for (let depth = $pos.depth; depth >= 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name === 'paragraph') {
      paragraphNode = node;
      paragraphDepth = depth;
    } else if (node.type.name === 'tableCell') {
      tableInfo = extractTableInfo($pos, depth);
      break;
    }
  }
  if (!paragraphNode || paragraphDepth < 0) return {};
  const paragraphPos = $pos.before(paragraphDepth);
  return { paragraphNode, paragraphPos, tableInfo };
}

/**
 * Extract table context information from a resolved position, if available.
 *
 * @param {import('prosemirror-model').ResolvedPos} $pos
 * @param {number} depth Depth at which to look for table cell context (e.g., run node depth + 1)
 * @returns {{
 *   tableProperties: Record<string, any>|null,
 *   rowIndex: number,
 *   cellIndex: number,
 *   numCells: number,
 *   numRows: number,
 * }|null}
 */
export function extractTableInfo($pos, depth) {
  const rowNode = $pos.node(depth - 1);
  const tableNode = $pos.node(depth - 2);
  if (rowNode.type.name !== 'tableRow' || tableNode.type.name !== 'table') {
    return null;
  }

  const fallbackInfo = {
    tableProperties: tableNode.attrs.tableProperties || null,
    rowIndex: $pos.index(depth - 2),
    cellIndex: $pos.index(depth - 1),
    numCells: rowNode.childCount,
    numRows: tableNode.childCount,
  };

  try {
    const tableMap = TableMap.get(tableNode);
    const tableStart = $pos.before(depth - 2) + 1;
    const cellStart = $pos.before(depth);
    const cellRect = tableMap.findCell(cellStart - tableStart);

    return {
      tableProperties: tableNode.attrs.tableProperties || null,
      rowIndex: cellRect.top,
      cellIndex: cellRect.left,
      numCells: tableMap.width,
      numRows: tableMap.height,
    };
  } catch {
    // Fall back to physical positions for malformed tables where TableMap cannot be built.
    return fallbackInfo;
  }
}

/**
 * Split a run node into segments whose inline runProperties match for adjacent content.
 *
 * @param {import('prosemirror-model').Node} runNode
 * @param {import('prosemirror-model').Node} paragraphNode
 * @param {{
 *   tableProperties: Record<string, any>|null,
 *   rowIndex: number,
 *   cellIndex: number,
 *   numCells: number,
 *   numRows: number,
 * }|null} tableInfo
 * @param {import('prosemirror-model').ResolvedPos} $pos
 * @param {object} editor
 * @returns {{ segments: Array<{ inlineProps: Record<string, any>|null, inlineKey: string, content: import('prosemirror-model').Node[] }>, firstInlineProps: Record<string, any>|null }}
 */
function segmentRunByInlineProps(
  runNode,
  paragraphNode,
  tableInfo,
  $pos,
  editor,
  removedKeys,
  preservedDerivedKeys,
  preferExistingKeys,
) {
  const segments = [];
  let lastKey = null;
  let boundaryCounter = 0;

  runNode.forEach((child) => {
    if (child.isText) {
      const { inlineProps, inlineKey } = computeInlineRunProps(
        child.marks,
        runNode.attrs?.runProperties,
        paragraphNode,
        tableInfo,
        $pos,
        editor,
        removedKeys,
        preservedDerivedKeys,
        preferExistingKeys,
      );
      const last = segments[segments.length - 1];
      if (last && inlineKey === lastKey) {
        last.content.push(child);
      } else {
        segments.push({ inlineProps, inlineKey, content: [child] });
        lastKey = inlineKey;
      }
      return;
    }

    const inlineProps = null;
    const inlineKey = `__boundary__${boundaryCounter++}`;
    segments.push({ inlineProps, inlineKey, content: [child] });
    lastKey = inlineKey;
  });

  const firstInlineProps = segments[0]?.inlineProps ?? null;
  return { segments, firstInlineProps };
}

/**
 * Compute the inline runProperties for a set of marks using paragraph/table style context.
 *
 * @param {import('prosemirror-model').Mark[]} marks
 * @param {Record<string, any>|null} existingRunProperties
 * @param {import('prosemirror-model').Node} paragraphNode
 * @param {{
 *   tableProperties: Record<string, any>|null,
 *   rowIndex: number,
 *   cellIndex: number,
 *   numCells: number,
 *   numRows: number,
 * }|null} tableInfo
 * @param {import('prosemirror-model').ResolvedPos} $pos
 * @param {object} editor
 * @returns {{ inlineProps: Record<string, any>|null, inlineKey: string }}
 */
function computeInlineRunProps(
  marks,
  existingRunProperties,
  paragraphNode,
  tableInfo,
  $pos,
  editor,
  removedKeys,
  preservedDerivedKeys,
  preferExistingKeys,
) {
  const runPropertiesFromMarks = decodeRPrFromMarks(marks);
  const paragraphProperties =
    getResolvedParagraphProperties(paragraphNode) || calculateResolvedParagraphProperties(editor, paragraphNode, $pos);
  const runPropertiesFromStyles = resolveRunProperties(
    {
      translatedNumbering: editor.converter?.translatedNumbering ?? {},
      translatedLinkedStyles: editor.converter?.translatedLinkedStyles ?? {},
    },
    existingRunProperties?.styleId != null ? { styleId: existingRunProperties?.styleId } : {},
    paragraphProperties,
    tableInfo,
    false,
    Boolean(paragraphNode.attrs.paragraphProperties?.numberingProperties),
  );

  const inlineRunProperties = getInlineRunProperties(
    runPropertiesFromMarks,
    runPropertiesFromStyles,
    existingRunProperties,
    editor,
    removedKeys,
    preservedDerivedKeys,
    preferExistingKeys,
  );
  const inlineProps = Object.keys(inlineRunProperties).length ? inlineRunProperties : null;
  const inlineKey = stableStringifyInlineProps(inlineProps);
  return { inlineProps, inlineKey };
}

/**
 * Keep run properties that differ from resolved styles, while preserving non-mark-derived existing fields.
 *
 * @param {Record<string, any>} runPropertiesFromMarks Properties decoded from marks.
 * @param {Record<string, any>} runPropertiesFromStyles Properties resolved from styles and paragraphs.
 * @param {Record<string, any>|null} existingRunProperties Existing runProperties on the run node.
 * @param {object} editor Editor instance used to normalize mark-level font-family comparisons.
 * @returns {Record<string, any>} Inline run properties that override styled defaults.
 */
function getInlineRunProperties(
  runPropertiesFromMarks,
  runPropertiesFromStyles,
  existingRunProperties,
  editor,
  removedKeys = new Set(),
  preservedDerivedKeys = new Set(),
  preferExistingKeys = new Set(),
) {
  const inlineRunProperties = {};
  for (const key in runPropertiesFromMarks) {
    if (preservedDerivedKeys.has(key)) {
      const fromMarks = runPropertiesFromMarks[key];
      const existing = existingRunProperties?.[key];
      if (preferExistingKeys.has(key) && existing != null) {
        // rFonts / runAttribute path: the run node was directly updated with
        // per-script data — existing is authoritative and already fresh.
        inlineRunProperties[key] = existing;
      } else if (
        fromMarks != null &&
        existing != null &&
        typeof fromMarks === 'object' &&
        typeof existing === 'object'
      ) {
        // textStyle mark path: use mark-decoded font names (fresh from the
        // current mark), merged with OOXML-only metadata from existing run
        // properties that the mark round-trip cannot represent (e.g. theme
        // refs, hint). The spread order ensures mark font names win over
        // stale existing names while preserving fields the mark cannot encode.
        inlineRunProperties[key] = { ...existing, ...fromMarks };
      } else if (fromMarks !== undefined) {
        inlineRunProperties[key] = fromMarks;
      }
      continue;
    }
    const valueFromMarks = runPropertiesFromMarks[key];
    const valueFromStyles = runPropertiesFromStyles[key];
    if (JSON.stringify(valueFromMarks) !== JSON.stringify(valueFromStyles)) {
      if (key === 'fontFamily') {
        const docx = editor.converter?.convertedXml ?? {};
        const markFromStyles = encodeMarksFromRPr({ [key]: valueFromStyles }, docx)[0];
        const markFromMarks = encodeMarksFromRPr({ [key]: valueFromMarks }, docx)[0];
        if (JSON.stringify(markFromMarks?.attrs) !== JSON.stringify(markFromStyles?.attrs)) {
          // SD-2894 follow-up (PR #3225 review): only preserve theme refs from `existing`
          // when the marks are a faithful re-derivation of the imported value. If marks
          // diverge from existing (user picked a new font), respect the user's choice
          // and drop the stale theme reference.
          const existingFontFamily = existingRunProperties?.[key];
          inlineRunProperties[key] = marksMatchExistingFontFamily(
            markFromMarks,
            existingFontFamily,
            encodeMarksFromRPr,
            docx,
          )
            ? mergeFontFamilyPreservingThemeRefs(valueFromMarks, existingFontFamily)
            : valueFromMarks;
        }
      } else {
        inlineRunProperties[key] = valueFromMarks;
      }
    }
  }

  if (existingRunProperties != null) {
    Object.keys(existingRunProperties).forEach((key) => {
      if (RUN_PROPERTIES_DERIVED_FROM_MARKS.has(key) && !preservedDerivedKeys.has(key)) return;
      const baseKey = COMPANION_INLINE_KEYS[key];
      if (baseKey && removedKeys.has(baseKey)) return;
      if (
        key === 'styleId' &&
        TRANSIENT_HYPERLINK_STYLE_IDS.has(existingRunProperties[key]) &&
        (runPropertiesFromMarks.styleId == null || runPropertiesFromMarks.styleId === '')
      ) {
        // Link-derived character styles must not survive after link/textStyle marks are removed.
        return;
      }
      if (key in inlineRunProperties) return;
      if (existingRunProperties[key] === undefined) return;
      inlineRunProperties[key] = existingRunProperties[key];
    });
  }

  return inlineRunProperties;
}

/**
 * Create a stable string key for inline runProperties for grouping.
 *
 * @param {Record<string, any>|null} inlineProps
 * @returns {string}
 */
function stableStringifyInlineProps(inlineProps) {
  if (!inlineProps || !Object.keys(inlineProps).length) return '__none__';
  const sortedKeys = Object.keys(inlineProps).sort();
  const sorted = {};
  sortedKeys.forEach((key) => {
    sorted[key] = inlineProps[key];
  });
  return JSON.stringify(sorted);
}

/**
 * Track and reapply selection across run replacements.
 *
 * @param {import('prosemirror-state').Transaction} tr
 * @param {import('prosemirror-state').Selection} originalSelection
 * @returns {{ mapReplacement: (startPos: number, nodeSize: number, replacement: Fragment) => void, finalize: () => void }|null}
 */
function createSelectionPreserver(tr, originalSelection, originalStoredMarks = null) {
  if (!originalSelection) return null;

  const isTextSelection = originalSelection instanceof TextSelection;
  let preservedAnchor = isTextSelection ? originalSelection.anchor : null;
  let preservedHead = isTextSelection ? originalSelection.head : null;
  const anchorAssoc = preservedAnchor != null && preservedHead != null && preservedAnchor <= preservedHead ? -1 : 1;
  const headAssoc = preservedAnchor != null && preservedHead != null && preservedHead >= preservedAnchor ? 1 : -1;

  /**
   * Map an offset inside a run's content to a position in the replacement fragment.
   *
   * @param {number} startPos
   * @param {Fragment} replacement
   * @param {number} offset
   * @returns {number}
   */
  function mapOffsetThroughReplacement(startPos, replacement, offset) {
    let currentPos = startPos;
    let remaining = offset;
    let mapped = null;

    replacement.forEach((node) => {
      if (mapped != null) return;
      const contentSize = node.content.size;
      if (remaining <= contentSize) {
        mapped = currentPos + 1 + remaining;
        return;
      }
      remaining -= contentSize;
      currentPos += node.nodeSize;
    });

    return mapped ?? currentPos;
  }

  /**
   * Remap preserved selection positions through a run replacement.
   *
   * @param {number} startPos
   * @param {number} nodeSize
   * @param {Fragment} replacement
   * @returns {void}
   */
  const mapReplacement = (startPos, nodeSize, replacement) => {
    if (!isTextSelection || preservedAnchor == null || preservedHead == null) return;

    const stepMap = tr.mapping.maps[tr.mapping.maps.length - 1];
    /**
     * Map a selection endpoint through the replacement while preserving association.
     *
     * @param {number|null} posToMap
     * @param {number} assoc
     * @returns {number|null}
     */
    const mapSelectionPos = (posToMap, assoc) => {
      if (posToMap == null) return null;
      if (posToMap < startPos || posToMap > startPos + nodeSize) {
        return stepMap.map(posToMap, assoc);
      }
      const offsetInRun = posToMap - (startPos + 1);
      return mapOffsetThroughReplacement(startPos, replacement, offsetInRun);
    };

    preservedAnchor = mapSelectionPos(preservedAnchor, anchorAssoc);
    preservedHead = mapSelectionPos(preservedHead, headAssoc);
  };

  /**
   * Apply the preserved selection after all replacements are complete.
   *
   * @returns {void}
   */
  const finalize = () => {
    if (!tr.docChanged) return;
    if (isTextSelection && preservedAnchor != null && preservedHead != null) {
      tr.setSelection(TextSelection.create(tr.doc, preservedAnchor, preservedHead));
      if (preservedAnchor === preservedHead && originalStoredMarks !== null) {
        tr.setStoredMarks(originalStoredMarks);
      }
      return;
    }
    tr.setSelection(originalSelection.map(tr.doc, tr.mapping));
  };

  return { mapReplacement, finalize };
}
