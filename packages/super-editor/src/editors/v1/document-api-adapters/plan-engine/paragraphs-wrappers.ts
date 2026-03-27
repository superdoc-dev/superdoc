/**
 * Paragraph property adapter wrappers — bridge `format.paragraph.*` and `styles.paragraph.*` operations
 * to ProseMirror paragraph node attribute mutations via the plan engine.
 *
 * Each wrapper:
 *   1. Rejects tracked mode (unsupported for paragraph properties)
 *   2. Resolves the target block from the block index
 *   3. Validates that the target is a paragraph-family node
 *   4. Short-circuits for dryRun
 *   5. Executes the mutation through `executeDomainCommand`
 *   6. Returns a typed ParagraphMutationResult
 */

import type { Editor } from '../../core/Editor.js';
import type {
  MutationOptions,
  ParagraphMutationResult,
  ParagraphTarget,
  ParagraphsSetStyleInput,
  ParagraphsClearStyleInput,
  ParagraphsResetDirectFormattingInput,
  ParagraphsSetAlignmentInput,
  ParagraphsClearAlignmentInput,
  ParagraphsSetIndentationInput,
  ParagraphsClearIndentationInput,
  ParagraphsSetSpacingInput,
  ParagraphsClearSpacingInput,
  ParagraphsSetKeepOptionsInput,
  ParagraphsSetOutlineLevelInput,
  ParagraphsSetFlowOptionsInput,
  ParagraphsSetTabStopInput,
  ParagraphsClearTabStopInput,
  ParagraphsClearAllTabStopsInput,
  ParagraphsSetBorderInput,
  ParagraphsClearBorderInput,
  ParagraphsSetShadingInput,
  ParagraphsClearShadingInput,
  ParagraphsSetDirectionInput,
  ParagraphsClearDirectionInput,
  ParagraphAlignment,
} from '@superdoc/document-api';
import { clearIndexCache, getBlockIndex } from '../helpers/index-cache.js';
import { findBlockByIdStrict, type BlockCandidate } from '../helpers/node-address-resolver.js';
import { DocumentApiAdapterError } from '../errors.js';
import { rejectTrackedMode } from '../helpers/mutation-helpers.js';
import { executeDomainCommand } from './plan-wrappers.js';

// ---------------------------------------------------------------------------
// Paragraph block types accepted by this adapter
// ---------------------------------------------------------------------------

const PARAGRAPH_NODE_TYPES = new Set(['paragraph', 'heading', 'listItem']);
const TEXT_STYLE_CHARACTER_STYLE_ATTR = 'styleId';
const DIRECT_FORMATTING_MARK_NAMES = new Set([
  'textStyle',
  'bold',
  'italic',
  'underline',
  'strike',
  'subscript',
  'superscript',
  'highlight',
]);

// ---------------------------------------------------------------------------
// Target resolution
// ---------------------------------------------------------------------------

function resolveParagraphBlock(editor: Editor, target: ParagraphTarget): BlockCandidate {
  const index = getBlockIndex(editor);
  const candidate = findBlockByIdStrict(index, target);

  if (!PARAGRAPH_NODE_TYPES.has(candidate.nodeType)) {
    throw new DocumentApiAdapterError(
      'INVALID_TARGET',
      `format.paragraph.* / styles.paragraph.* operations require a paragraph, heading, or listItem target. Got "${candidate.nodeType}".`,
      { nodeType: candidate.nodeType },
    );
  }

  return candidate;
}

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

function successResult(target: ParagraphTarget): ParagraphMutationResult {
  return { success: true, target, resolution: { target } };
}

function noOpResult(operation: string): ParagraphMutationResult {
  return {
    success: false,
    failure: { code: 'NO_OP', message: `${operation} produced no changes.` },
  };
}

type MarkLike = {
  type?: { name?: string; create?: (attrs: Record<string, unknown>) => unknown };
  attrs?: Record<string, unknown>;
};

type TransactionWithMarkMutations = {
  doc?: {
    nodesBetween?: (
      from: number,
      to: number,
      callback: (
        node: { isText?: boolean; marks?: ReadonlyArray<MarkLike>; nodeSize?: number },
        pos: number,
      ) => boolean | void,
    ) => void;
  };
  removeMark?: (from: number, to: number, mark: unknown) => unknown;
  addMark?: (from: number, to: number, mark: unknown) => unknown;
};

function getPreservedCharacterStyleAttrs(mark: MarkLike): Record<string, string> | null {
  const styleId = mark.attrs?.[TEXT_STYLE_CHARACTER_STYLE_ATTR];
  if (typeof styleId !== 'string' || styleId.length === 0) return null;
  return { [TEXT_STYLE_CHARACTER_STYLE_ATTR]: styleId };
}

function hasTextStyleDirectFormatting(mark: MarkLike): boolean {
  return Object.entries(mark.attrs ?? {}).some(
    ([key, value]) => key !== TEXT_STYLE_CHARACTER_STYLE_ATTR && value != null,
  );
}

function clearTextStyleDirectFormatting(
  tr: TransactionWithMarkMutations,
  from: number,
  to: number,
  mark: MarkLike,
): boolean {
  const preservedCharacterStyle = getPreservedCharacterStyleAttrs(mark);
  const hadDirectFormatting = hasTextStyleDirectFormatting(mark);

  if (!hadDirectFormatting && preservedCharacterStyle) {
    return false;
  }

  tr.removeMark?.(from, to, mark);

  if (hadDirectFormatting && preservedCharacterStyle && mark.type?.create && tr.addMark) {
    tr.addMark(from, to, mark.type.create(preservedCharacterStyle));
  }

  return true;
}

function clearDirectFormattingInBlock(tr: TransactionWithMarkMutations, pos: number, nodeSize: number): boolean {
  if (!tr.doc?.nodesBetween || !tr.removeMark || nodeSize <= 2) return false;

  let changed = false;
  tr.doc.nodesBetween(pos + 1, pos + nodeSize - 1, (node, nodePos) => {
    if (!node.isText || !Array.isArray(node.marks) || node.marks.length === 0 || typeof node.nodeSize !== 'number') {
      return true;
    }

    node.marks.forEach((mark) => {
      const markName = mark?.type?.name;
      if (!markName || !DIRECT_FORMATTING_MARK_NAMES.has(markName)) return;

      if (markName === 'textStyle') {
        changed = clearTextStyleDirectFormatting(tr, nodePos, nodePos + node.nodeSize!, mark) || changed;
        return;
      }

      tr.removeMark(nodePos, nodePos + node.nodeSize!, mark);
      changed = true;
    });

    return true;
  });

  return changed;
}

// ---------------------------------------------------------------------------
// Core mutation helper — transforms paragraphProperties on a resolved block
// ---------------------------------------------------------------------------

/** Loose runtime shape of paragraphProperties stored on ProseMirror nodes. */
type PPr = Record<string, unknown>;

/**
 * Resolves the target, applies a transform to the paragraph's `paragraphProperties`,
 * and dispatches the resulting transaction through the plan engine.
 */
function mutateParagraphProperties(
  editor: Editor,
  candidate: BlockCandidate,
  operation: string,
  target: ParagraphTarget,
  transform: (pPr: PPr) => PPr,
  options?: MutationOptions,
  extras?: {
    clearDirectFormatting?: boolean;
  },
): ParagraphMutationResult {
  if (options?.dryRun) return successResult(target);

  const receipt = executeDomainCommand(
    editor,
    () => {
      const node = editor.state.doc.nodeAt(candidate.pos);
      if (!node) return false;

      const existing = (node.attrs as { paragraphProperties?: PPr }).paragraphProperties ?? {};
      const updated = transform({ ...existing });

      if (JSON.stringify(existing) === JSON.stringify(updated)) return false;

      const tr = editor.state.tr;

      if (extras?.clearDirectFormatting) {
        clearDirectFormattingInBlock(tr, candidate.pos, node.nodeSize);
      }

      tr.setNodeMarkup(candidate.pos, undefined, { ...node.attrs, paragraphProperties: updated });
      editor.dispatch(tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (receipt.steps[0]?.effect !== 'changed') {
    return noOpResult(operation);
  }

  return successResult(target);
}

// ---------------------------------------------------------------------------
// Alignment mapping — external API → OOXML justification value
// ---------------------------------------------------------------------------

const ALIGNMENT_TO_JUSTIFICATION: Record<ParagraphAlignment, string> = {
  left: 'left',
  center: 'center',
  right: 'right',
  justify: 'both',
};

// ---------------------------------------------------------------------------
// Property helpers
// ---------------------------------------------------------------------------

/** Merge only defined fields from a patch into an existing object. */
function mergeDefinedFields(existing: PPr | undefined, patch: Record<string, unknown>): PPr {
  const result = { ...(existing ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}

/**
 * Merges indentation fields while enforcing OOXML exclusivity:
 * `firstLine` and `hanging` cannot co-exist on the same paragraph.
 */
function mergeIndentationFields(existing: PPr | undefined, patch: Record<string, unknown>): PPr {
  const result = mergeDefinedFields(existing, patch);
  const firstLineWasUpdated = patch.firstLine !== undefined;
  const hangingWasUpdated = patch.hanging !== undefined;

  if (firstLineWasUpdated && !hangingWasUpdated) {
    delete result.hanging;
  }
  if (hangingWasUpdated && !firstLineWasUpdated) {
    delete result.firstLine;
  }

  return result;
}

/** Remove a key from an object, returning undefined if the object is now empty. */
function deleteKey(obj: PPr, key: string): PPr | undefined {
  const result = { ...obj };
  delete result[key];
  return Object.keys(result).length > 0 ? result : undefined;
}

// ---------------------------------------------------------------------------
// Tab stop helpers
// ---------------------------------------------------------------------------

interface TabStopEntry {
  tab: { pos: number; tabType: string; leader?: string };
}

function addOrReplaceTabStop(existing: TabStopEntry[] | undefined, entry: TabStopEntry): TabStopEntry[] {
  const filtered = (existing ?? []).filter((t) => t.tab.pos !== entry.tab.pos);
  return [...filtered, entry].sort((a, b) => a.tab.pos - b.tab.pos);
}

function removeTabStop(existing: TabStopEntry[] | undefined, position: number): TabStopEntry[] | undefined {
  const filtered = (existing ?? []).filter((t) => t.tab.pos !== position);
  return filtered.length > 0 ? filtered : undefined;
}

// ---------------------------------------------------------------------------
// Wrapper functions
// ---------------------------------------------------------------------------

export function paragraphsSetStyleWrapper(
  editor: Editor,
  input: ParagraphsSetStyleInput,
  options?: MutationOptions,
): ParagraphMutationResult {
  rejectTrackedMode('styles.paragraph.setStyle', options);
  const candidate = resolveParagraphBlock(editor, input.target);
  return mutateParagraphProperties(
    editor,
    candidate,
    'styles.paragraph.setStyle',
    input.target,
    (pPr) => ({
      ...pPr,
      styleId: input.styleId,
    }),
    options,
    { clearDirectFormatting: true },
  );
}

export function paragraphsClearStyleWrapper(
  editor: Editor,
  input: ParagraphsClearStyleInput,
  options?: MutationOptions,
): ParagraphMutationResult {
  rejectTrackedMode('styles.paragraph.clearStyle', options);
  const candidate = resolveParagraphBlock(editor, input.target);
  return mutateParagraphProperties(
    editor,
    candidate,
    'styles.paragraph.clearStyle',
    input.target,
    (pPr) => {
      const result = { ...pPr };
      delete result.styleId;
      return result;
    },
    options,
  );
}

export function paragraphsResetDirectFormattingWrapper(
  editor: Editor,
  input: ParagraphsResetDirectFormattingInput,
  options?: MutationOptions,
): ParagraphMutationResult {
  rejectTrackedMode('format.paragraph.resetDirectFormatting', options);
  const candidate = resolveParagraphBlock(editor, input.target);
  return mutateParagraphProperties(
    editor,
    candidate,
    'format.paragraph.resetDirectFormatting',
    input.target,
    (pPr) => {
      // Keep only structural references and section metadata; clear all direct formatting.
      const result: PPr = {};
      if (pPr.styleId !== undefined) result.styleId = pPr.styleId;
      if (pPr.numberingProperties !== undefined) result.numberingProperties = pPr.numberingProperties;
      if (pPr.sectPr !== undefined) result.sectPr = pPr.sectPr;
      return result;
    },
    options,
  );
}

export function paragraphsSetAlignmentWrapper(
  editor: Editor,
  input: ParagraphsSetAlignmentInput,
  options?: MutationOptions,
): ParagraphMutationResult {
  rejectTrackedMode('format.paragraph.setAlignment', options);
  const candidate = resolveParagraphBlock(editor, input.target);
  return mutateParagraphProperties(
    editor,
    candidate,
    'format.paragraph.setAlignment',
    input.target,
    (pPr) => ({
      ...pPr,
      justification: ALIGNMENT_TO_JUSTIFICATION[input.alignment],
    }),
    options,
  );
}

export function paragraphsClearAlignmentWrapper(
  editor: Editor,
  input: ParagraphsClearAlignmentInput,
  options?: MutationOptions,
): ParagraphMutationResult {
  rejectTrackedMode('format.paragraph.clearAlignment', options);
  const candidate = resolveParagraphBlock(editor, input.target);
  return mutateParagraphProperties(
    editor,
    candidate,
    'format.paragraph.clearAlignment',
    input.target,
    (pPr) => {
      const result = { ...pPr };
      delete result.justification;
      return result;
    },
    options,
  );
}

export function paragraphsSetIndentationWrapper(
  editor: Editor,
  input: ParagraphsSetIndentationInput,
  options?: MutationOptions,
): ParagraphMutationResult {
  rejectTrackedMode('format.paragraph.setIndentation', options);
  const candidate = resolveParagraphBlock(editor, input.target);
  return mutateParagraphProperties(
    editor,
    candidate,
    'format.paragraph.setIndentation',
    input.target,
    (pPr) => ({
      ...pPr,
      indent: mergeIndentationFields(pPr.indent as PPr | undefined, {
        left: input.left,
        right: input.right,
        firstLine: input.firstLine,
        hanging: input.hanging,
      }),
    }),
    options,
  );
}

export function paragraphsClearIndentationWrapper(
  editor: Editor,
  input: ParagraphsClearIndentationInput,
  options?: MutationOptions,
): ParagraphMutationResult {
  rejectTrackedMode('format.paragraph.clearIndentation', options);
  const candidate = resolveParagraphBlock(editor, input.target);
  return mutateParagraphProperties(
    editor,
    candidate,
    'format.paragraph.clearIndentation',
    input.target,
    (pPr) => {
      const result = { ...pPr };
      delete result.indent;
      return result;
    },
    options,
  );
}

export function paragraphsSetSpacingWrapper(
  editor: Editor,
  input: ParagraphsSetSpacingInput,
  options?: MutationOptions,
): ParagraphMutationResult {
  rejectTrackedMode('format.paragraph.setSpacing', options);
  const candidate = resolveParagraphBlock(editor, input.target);
  return mutateParagraphProperties(
    editor,
    candidate,
    'format.paragraph.setSpacing',
    input.target,
    (pPr) => ({
      ...pPr,
      spacing: mergeDefinedFields(pPr.spacing as PPr | undefined, {
        before: input.before,
        after: input.after,
        line: input.line,
        lineRule: input.lineRule,
      }),
    }),
    options,
  );
}

export function paragraphsClearSpacingWrapper(
  editor: Editor,
  input: ParagraphsClearSpacingInput,
  options?: MutationOptions,
): ParagraphMutationResult {
  rejectTrackedMode('format.paragraph.clearSpacing', options);
  const candidate = resolveParagraphBlock(editor, input.target);
  return mutateParagraphProperties(
    editor,
    candidate,
    'format.paragraph.clearSpacing',
    input.target,
    (pPr) => {
      const result = { ...pPr };
      delete result.spacing;
      return result;
    },
    options,
  );
}

export function paragraphsSetKeepOptionsWrapper(
  editor: Editor,
  input: ParagraphsSetKeepOptionsInput,
  options?: MutationOptions,
): ParagraphMutationResult {
  rejectTrackedMode('format.paragraph.setKeepOptions', options);
  const candidate = resolveParagraphBlock(editor, input.target);
  return mutateParagraphProperties(
    editor,
    candidate,
    'format.paragraph.setKeepOptions',
    input.target,
    (pPr) => {
      const result = { ...pPr };
      if (input.keepNext !== undefined) result.keepNext = input.keepNext;
      if (input.keepLines !== undefined) result.keepLines = input.keepLines;
      if (input.widowControl !== undefined) result.widowControl = input.widowControl;
      return result;
    },
    options,
  );
}

export function paragraphsSetOutlineLevelWrapper(
  editor: Editor,
  input: ParagraphsSetOutlineLevelInput,
  options?: MutationOptions,
): ParagraphMutationResult {
  rejectTrackedMode('format.paragraph.setOutlineLevel', options);
  const candidate = resolveParagraphBlock(editor, input.target);
  return mutateParagraphProperties(
    editor,
    candidate,
    'format.paragraph.setOutlineLevel',
    input.target,
    (pPr) => {
      if (input.outlineLevel === null) {
        const result = { ...pPr };
        delete result.outlineLvl;
        return result;
      }
      return { ...pPr, outlineLvl: input.outlineLevel };
    },
    options,
  );
}

export function paragraphsSetFlowOptionsWrapper(
  editor: Editor,
  input: ParagraphsSetFlowOptionsInput,
  options?: MutationOptions,
): ParagraphMutationResult {
  rejectTrackedMode('format.paragraph.setFlowOptions', options);
  const candidate = resolveParagraphBlock(editor, input.target);
  return mutateParagraphProperties(
    editor,
    candidate,
    'format.paragraph.setFlowOptions',
    input.target,
    (pPr) => {
      const result = { ...pPr };
      if (input.contextualSpacing !== undefined) result.contextualSpacing = input.contextualSpacing;
      if (input.pageBreakBefore !== undefined) result.pageBreakBefore = input.pageBreakBefore;
      if (input.suppressAutoHyphens !== undefined) result.suppressAutoHyphens = input.suppressAutoHyphens;
      return result;
    },
    options,
  );
}

export function paragraphsSetTabStopWrapper(
  editor: Editor,
  input: ParagraphsSetTabStopInput,
  options?: MutationOptions,
): ParagraphMutationResult {
  rejectTrackedMode('format.paragraph.setTabStop', options);
  const candidate = resolveParagraphBlock(editor, input.target);
  return mutateParagraphProperties(
    editor,
    candidate,
    'format.paragraph.setTabStop',
    input.target,
    (pPr) => {
      const entry: TabStopEntry = {
        tab: {
          pos: input.position,
          tabType: input.alignment,
          ...(input.leader !== undefined && { leader: input.leader }),
        },
      };
      return { ...pPr, tabStops: addOrReplaceTabStop(pPr.tabStops as TabStopEntry[] | undefined, entry) };
    },
    options,
  );
}

export function paragraphsClearTabStopWrapper(
  editor: Editor,
  input: ParagraphsClearTabStopInput,
  options?: MutationOptions,
): ParagraphMutationResult {
  rejectTrackedMode('format.paragraph.clearTabStop', options);
  const candidate = resolveParagraphBlock(editor, input.target);
  return mutateParagraphProperties(
    editor,
    candidate,
    'format.paragraph.clearTabStop',
    input.target,
    (pPr) => {
      const updated = removeTabStop(pPr.tabStops as TabStopEntry[] | undefined, input.position);
      if (updated === undefined) {
        const result = { ...pPr };
        delete result.tabStops;
        return result;
      }
      return { ...pPr, tabStops: updated };
    },
    options,
  );
}

export function paragraphsClearAllTabStopsWrapper(
  editor: Editor,
  input: ParagraphsClearAllTabStopsInput,
  options?: MutationOptions,
): ParagraphMutationResult {
  rejectTrackedMode('format.paragraph.clearAllTabStops', options);
  const candidate = resolveParagraphBlock(editor, input.target);
  return mutateParagraphProperties(
    editor,
    candidate,
    'format.paragraph.clearAllTabStops',
    input.target,
    (pPr) => {
      const result = { ...pPr };
      delete result.tabStops;
      return result;
    },
    options,
  );
}

export function paragraphsSetBorderWrapper(
  editor: Editor,
  input: ParagraphsSetBorderInput,
  options?: MutationOptions,
): ParagraphMutationResult {
  rejectTrackedMode('format.paragraph.setBorder', options);
  const candidate = resolveParagraphBlock(editor, input.target);
  return mutateParagraphProperties(
    editor,
    candidate,
    'format.paragraph.setBorder',
    input.target,
    (pPr) => {
      const existing = (pPr.borders as PPr) ?? {};
      const border: PPr = { val: input.style };
      if (input.color !== undefined) border.color = input.color;
      if (input.size !== undefined) border.size = input.size;
      if (input.space !== undefined) border.space = input.space;
      return { ...pPr, borders: { ...existing, [input.side]: border } };
    },
    options,
  );
}

export function paragraphsClearBorderWrapper(
  editor: Editor,
  input: ParagraphsClearBorderInput,
  options?: MutationOptions,
): ParagraphMutationResult {
  rejectTrackedMode('format.paragraph.clearBorder', options);
  const candidate = resolveParagraphBlock(editor, input.target);
  return mutateParagraphProperties(
    editor,
    candidate,
    'format.paragraph.clearBorder',
    input.target,
    (pPr) => {
      if (input.side === 'all') {
        const result = { ...pPr };
        delete result.borders;
        return result;
      }
      const updated = deleteKey((pPr.borders as PPr) ?? {}, input.side);
      if (updated === undefined) {
        const result = { ...pPr };
        delete result.borders;
        return result;
      }
      return { ...pPr, borders: updated };
    },
    options,
  );
}

export function paragraphsSetShadingWrapper(
  editor: Editor,
  input: ParagraphsSetShadingInput,
  options?: MutationOptions,
): ParagraphMutationResult {
  rejectTrackedMode('format.paragraph.setShading', options);
  const candidate = resolveParagraphBlock(editor, input.target);
  return mutateParagraphProperties(
    editor,
    candidate,
    'format.paragraph.setShading',
    input.target,
    (pPr) => ({
      ...pPr,
      shading: mergeDefinedFields(pPr.shading as PPr | undefined, {
        fill: input.fill,
        color: input.color,
        val: input.pattern,
      }),
    }),
    options,
  );
}

export function paragraphsClearShadingWrapper(
  editor: Editor,
  input: ParagraphsClearShadingInput,
  options?: MutationOptions,
): ParagraphMutationResult {
  rejectTrackedMode('format.paragraph.clearShading', options);
  const candidate = resolveParagraphBlock(editor, input.target);
  return mutateParagraphProperties(
    editor,
    candidate,
    'format.paragraph.clearShading',
    input.target,
    (pPr) => {
      const result = { ...pPr };
      delete result.shading;
      return result;
    },
    options,
  );
}

export function paragraphsSetDirectionWrapper(
  editor: Editor,
  input: ParagraphsSetDirectionInput,
  options?: MutationOptions,
): ParagraphMutationResult {
  rejectTrackedMode('format.paragraph.setDirection', options);
  const candidate = resolveParagraphBlock(editor, input.target);
  return mutateParagraphProperties(
    editor,
    candidate,
    'format.paragraph.setDirection',
    input.target,
    (pPr) => {
      const result = { ...pPr };
      result.rightToLeft = input.direction === 'rtl';
      if (input.alignmentPolicy === 'matchDirection') {
        result.justification = input.direction === 'rtl' ? 'right' : 'left';
      }
      return result;
    },
    options,
  );
}

export function paragraphsClearDirectionWrapper(
  editor: Editor,
  input: ParagraphsClearDirectionInput,
  options?: MutationOptions,
): ParagraphMutationResult {
  rejectTrackedMode('format.paragraph.clearDirection', options);
  const candidate = resolveParagraphBlock(editor, input.target);
  return mutateParagraphProperties(
    editor,
    candidate,
    'format.paragraph.clearDirection',
    input.target,
    (pPr) => {
      const result = { ...pPr };
      delete result.rightToLeft;
      return result;
    },
    options,
  );
}
