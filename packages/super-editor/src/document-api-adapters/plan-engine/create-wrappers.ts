/**
 * Create convenience wrappers — bridge create.paragraph and create.heading
 * to the plan engine's execution path.
 *
 * Each wrapper resolves the insertion position, calls the editor command,
 * and manages revision tracking through the plan engine's revision system.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Editor } from '../../core/Editor.js';
import type {
  CreateParagraphInput,
  CreateParagraphResult,
  CreateParagraphSuccessResult,
  CreateHeadingInput,
  CreateHeadingResult,
  CreateHeadingSuccessResult,
  MutationOptions,
  StoryLocator,
} from '@superdoc/document-api';
import { clearIndexCache, getBlockIndex } from '../helpers/index-cache.js';
import { type BlockCandidate } from '../helpers/node-address-resolver.js';
import { resolveCreateAnchor } from './create-insertion.js';
import { collectTrackInsertRefsInRange } from '../helpers/tracked-change-refs.js';
import { DocumentApiAdapterError } from '../errors.js';
import { requireEditorCommand, ensureTrackedCapability } from '../helpers/mutation-helpers.js';
import { executeDomainCommand, resolveWriteStoryRuntime, disposeEphemeralWriteRuntime } from './plan-wrappers.js';
import { getRevision } from './revision-tracker.js';
import { encodeV4Ref } from '../story-runtime/story-ref-codec.js';

// ---------------------------------------------------------------------------
// Ref minting — create a text-scoped ref for the created block so the
// caller can immediately use it with superdoc_format without searching.
// ---------------------------------------------------------------------------

function mintBlockRef(editor: Editor, storyKey: string, nodeId: string, textLength: number): string {
  const rev = getRevision(editor);
  return encodeV4Ref({
    v: 4,
    rev,
    storyKey,
    scope: 'block',
    matchId: `create:${nodeId}`,
    segments: [{ blockId: nodeId, start: 0, end: textLength }],
    blockIndex: 0,
  });
}

// ---------------------------------------------------------------------------
// Auto-formatting: apply fontFamily + color from nearby blocks so new
// headings/paragraphs match the document's visual style without extra LLM steps.
// ---------------------------------------------------------------------------

function findNearbyFormatting(
  editor: Editor,
  _pos: number,
  skipHeadings: boolean,
): { fontFamily?: string; fontSize?: number; bold?: boolean; color?: string } | null {
  const doc = editor.state.doc;
  const result: { fontFamily?: string; fontSize?: number; bold?: boolean; color?: string } = {};

  // Walk top-level children near the insertion point
  let offset = 0;
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i);
    const childEnd = offset + child.nodeSize;

    if (child.type.name === 'paragraph') {
      const pProps = (child.attrs as Record<string, unknown>).paragraphProperties as { styleId?: string } | undefined;
      const isHeading = pProps?.styleId && /^Heading\d$/.test(pProps.styleId);

      if (skipHeadings && isHeading) {
        offset = childEnd;
        continue;
      }

      // Read formatting from text marks
      child.descendants((textNode) => {
        if (result.fontFamily) return false;
        const marks = textNode.marks ?? [];
        if (!textNode.isText || marks.length === 0) return;
        for (const mark of marks) {
          const attrs = mark.attrs as Record<string, unknown>;
          if (typeof attrs.fontFamily === 'string' && attrs.fontFamily) {
            result.fontFamily = attrs.fontFamily;
          }
          if (typeof attrs.color === 'string' && attrs.color) {
            result.color = attrs.color;
          }
          if (attrs.fontSize != null) {
            const raw = typeof attrs.fontSize === 'string' ? parseFloat(attrs.fontSize as string) : attrs.fontSize;
            if (typeof raw === 'number' && Number.isFinite(raw)) result.fontSize = raw as number;
          }
          if (attrs.bold === true) result.bold = true;
          else if (result.bold === undefined) result.bold = false;
        }
        return false;
      });

      if (result.fontFamily) {
        // Default to black when no explicit color is set (matches extractBlockFormatting behavior)
        if (!result.color) result.color = '#000000';
        return result;
      }
    }

    offset = childEnd;
  }

  if (result.fontFamily && !result.color) result.color = '#000000';
  return result.fontFamily ? result : null;
}

function applyFormattingToCreatedBlock(
  editor: Editor,
  nodeId: string,
  formatting: { fontFamily?: string; fontSize?: number; bold?: boolean; color?: string },
): void {
  const doc = editor.state.doc;
  const textStyleType = editor.state.schema.marks.textStyle;
  let blockPos = -1;
  let blockEnd = -1;

  // Find the created paragraph
  doc.descendants((node, pos) => {
    if (blockPos >= 0) return false;
    const attrs = node.attrs as Record<string, unknown>;
    if (node.type.name === 'paragraph' && (attrs.sdBlockId === nodeId || attrs.paraId === nodeId)) {
      blockPos = pos + 1;
      blockEnd = pos + node.nodeSize - 1;
      return false;
    }
  });

  if (blockPos < 0 || blockEnd <= blockPos) return;

  const tr = editor.state.tr;

  // 1. Add textStyle marks on text nodes (so marks are the source of truth)
  if (textStyleType) {
    const mark = textStyleType.create({
      fontFamily: formatting.fontFamily ?? null,
      fontSize: formatting.fontSize ?? null,
      bold: formatting.bold ?? null,
      color: formatting.color ?? null,
    });
    tr.addMark(blockPos, blockEnd, mark);
  }

  // 2. Also set runProperties directly on run nodes (so the style engine
  //    cascade sees them as inlineRpr, the highest-priority layer)
  doc.nodesBetween(blockPos, blockEnd, (node, pos) => {
    if (node.type.name === 'run') {
      const existingRp = (node.attrs as Record<string, unknown>).runProperties as Record<string, unknown> | undefined;
      const merged: Record<string, unknown> = { ...(existingRp ?? {}) };
      if (formatting.fontFamily) merged.fontFamily = formatting.fontFamily;
      if (formatting.fontSize != null) merged.fontSize = formatting.fontSize;
      if (formatting.bold != null) merged.bold = formatting.bold;
      if (formatting.color) merged.color = formatting.color;
      tr.setNodeMarkup(pos, null, { ...node.attrs, runProperties: merged });
    }
  });

  // 3. Tell calculateInlineRunPropertiesPlugin to PRESERVE our values
  //    instead of re-deriving them from the style cascade.
  const preserveKeys = Object.keys(formatting).filter((k) => (formatting as Record<string, unknown>)[k] != null);
  if (preserveKeys.length > 0) {
    tr.setMeta(
      'sdPreserveRunPropertiesKeys',
      preserveKeys.map((k) => ({ key: k, preferExisting: true })),
    );
  }

  tr.setMeta('inputType', 'programmatic');
  editor.dispatch(tr);
}

// ---------------------------------------------------------------------------
// Command types (internal to the wrapper)
// ---------------------------------------------------------------------------

type InsertParagraphAtCommandOptions = {
  pos: number;
  text?: string;
  sdBlockId?: string;
  tracked?: boolean;
};

type InsertParagraphAtCommand = (options: InsertParagraphAtCommandOptions) => boolean;

type InsertHeadingAtCommandOptions = {
  pos: number;
  level: number;
  text?: string;
  sdBlockId?: string;
  tracked?: boolean;
};

type InsertHeadingAtCommand = (options: InsertHeadingAtCommandOptions) => boolean;

// ---------------------------------------------------------------------------
// Position resolution helpers
// ---------------------------------------------------------------------------

function resolveCreateInsertPosition(
  editor: Editor,
  at: CreateParagraphInput['at'] | CreateHeadingInput['at'],
): number {
  const location = at ?? { kind: 'documentEnd' };

  if (location.kind === 'documentStart') return 0;
  if (location.kind === 'documentEnd') return editor.state.doc.content.size;

  // Delegate before/after resolution to shared helper with pre-flight nodeType validation
  const { pos } = resolveCreateAnchor(editor, location.target, location.kind);
  return pos;
}

// ---------------------------------------------------------------------------
// Post-execution block resolution helpers
// ---------------------------------------------------------------------------

function resolveCreatedBlock(editor: Editor, nodeType: string, blockId: string): BlockCandidate {
  const index = getBlockIndex(editor);
  const resolved = index.byId.get(`${nodeType}:${blockId}`);
  if (resolved) return resolved;

  const bySdBlockId = index.candidates.find((candidate) => {
    if (candidate.nodeType !== nodeType) return false;
    const attrs = (candidate.node as { attrs?: { sdBlockId?: unknown } }).attrs;
    return typeof attrs?.sdBlockId === 'string' && attrs.sdBlockId === blockId;
  });
  if (bySdBlockId) return bySdBlockId;

  const fallback = index.candidates.find(
    (candidate) => candidate.nodeType === nodeType && candidate.nodeId === blockId,
  );
  if (fallback) return fallback;

  throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `Created ${nodeType} could not be resolved after insertion.`, {
    [`${nodeType}Id`]: blockId,
  });
}

// ---------------------------------------------------------------------------
// Result builders
// ---------------------------------------------------------------------------

function buildParagraphCreateSuccess(
  paragraphNodeId: string,
  trackedChangeRefs?: CreateParagraphSuccessResult['trackedChangeRefs'],
  story?: StoryLocator,
  ref?: string,
): CreateParagraphSuccessResult {
  return {
    success: true,
    paragraph: {
      kind: 'block',
      nodeType: 'paragraph',
      nodeId: paragraphNodeId,
      ...(story && { story }),
    },
    insertionPoint: {
      kind: 'text',
      blockId: paragraphNodeId,
      range: { start: 0, end: 0 },
      ...(story && { story }),
    },
    trackedChangeRefs,
    ...(ref ? { ref } : {}),
  };
}

function buildHeadingCreateSuccess(
  headingNodeId: string,
  trackedChangeRefs?: CreateHeadingSuccessResult['trackedChangeRefs'],
  story?: StoryLocator,
  ref?: string,
): CreateHeadingSuccessResult {
  return {
    success: true,
    heading: {
      kind: 'block',
      nodeType: 'heading',
      nodeId: headingNodeId,
      ...(story && { story }),
    },
    insertionPoint: {
      kind: 'text',
      blockId: headingNodeId,
      range: { start: 0, end: 0 },
      ...(story && { story }),
    },
    trackedChangeRefs,
    ...(ref ? { ref } : {}),
  };
}

// ---------------------------------------------------------------------------
// create.paragraph wrapper
// ---------------------------------------------------------------------------

export function createParagraphWrapper(
  editor: Editor,
  input: CreateParagraphInput,
  options?: MutationOptions,
): CreateParagraphResult {
  const runtime = resolveWriteStoryRuntime(editor, input.in);
  const storyEditor = runtime.editor;

  try {
    const insertParagraphAt = requireEditorCommand(
      storyEditor.commands?.insertParagraphAt,
      'create.paragraph',
    ) as InsertParagraphAtCommand;
    const mode = options?.changeMode ?? 'direct';

    if (mode === 'tracked') {
      ensureTrackedCapability(storyEditor, { operation: 'create.paragraph' });
    }

    const insertAt = resolveCreateInsertPosition(storyEditor, input.at);

    if (options?.dryRun) {
      const canInsert = storyEditor.can().insertParagraphAt?.({
        pos: insertAt,
        text: input.text,
        tracked: mode === 'tracked',
      });

      if (!canInsert) {
        return {
          success: false,
          failure: {
            code: 'INVALID_TARGET',
            message: 'Paragraph creation could not be applied at the requested location.',
          },
        };
      }

      return {
        success: true,
        paragraph: {
          kind: 'block',
          nodeType: 'paragraph',
          nodeId: '(dry-run)',
        },
        insertionPoint: {
          kind: 'text',
          blockId: '(dry-run)',
          range: { start: 0, end: 0 },
        },
      };
    }

    const paragraphId = uuidv4();
    let canonicalId = paragraphId;
    let trackedChangeRefs: CreateParagraphSuccessResult['trackedChangeRefs'] | undefined;

    const receipt = executeDomainCommand(
      storyEditor,
      () => {
        const didApply = insertParagraphAt({
          pos: insertAt,
          text: input.text,
          sdBlockId: paragraphId,
          tracked: mode === 'tracked',
        });
        if (didApply) {
          clearIndexCache(storyEditor);
          try {
            const paragraph = resolveCreatedBlock(storyEditor, 'paragraph', paragraphId);
            canonicalId = paragraph.nodeId;
            if (mode === 'tracked') {
              trackedChangeRefs = collectTrackInsertRefsInRange(storyEditor, paragraph.pos, paragraph.end);
            }
          } catch (e) {
            // Post-insertion resolution is best-effort — the block was created but may not
            // be immediately resolvable (e.g., index timing). Only suppress known resolution
            // failures; rethrow unexpected errors.
            if (!(e instanceof DocumentApiAdapterError)) throw e;
          }
        }
        return didApply;
      },
      { expectedRevision: options?.expectedRevision },
    );

    if (receipt.steps[0]?.effect !== 'changed') {
      return {
        success: false,
        failure: {
          code: 'INVALID_TARGET',
          message: 'Paragraph creation could not be applied at the requested location.',
        },
      };
    }

    if (runtime.commit) runtime.commit(editor);

    // Auto-apply fontFamily + fontSize + color from nearby blocks so the
    // paragraph matches the document's visual style without extra LLM steps.
    try {
      if (input.text) {
        const formatting = findNearbyFormatting(storyEditor, insertAt, false);
        if (formatting) {
          applyFormattingToCreatedBlock(storyEditor, paragraphId, formatting);
        }
      }
    } catch (e) {
      // Best-effort — formatting failure should not break creation
      console.warn('[create-wrapper] auto-formatting failed:', e);
    }

    const nonBodyStory = runtime.kind !== 'body' ? runtime.locator : undefined;
    const textLen = input.text?.length ?? 0;
    const ref = textLen > 0 ? mintBlockRef(storyEditor, runtime.storyKey, canonicalId, textLen) : undefined;
    return buildParagraphCreateSuccess(canonicalId, trackedChangeRefs, nonBodyStory, ref);
  } finally {
    disposeEphemeralWriteRuntime(runtime);
  }
}

// ---------------------------------------------------------------------------
// create.heading wrapper
// ---------------------------------------------------------------------------

export function createHeadingWrapper(
  editor: Editor,
  input: CreateHeadingInput,
  options?: MutationOptions,
): CreateHeadingResult {
  const runtime = resolveWriteStoryRuntime(editor, input.in);
  const storyEditor = runtime.editor;

  try {
    const insertHeadingAt = requireEditorCommand(
      storyEditor.commands?.insertHeadingAt,
      'create.heading',
    ) as InsertHeadingAtCommand;
    const mode = options?.changeMode ?? 'direct';

    if (mode === 'tracked') {
      ensureTrackedCapability(storyEditor, { operation: 'create.heading' });
    }

    const insertAt = resolveCreateInsertPosition(storyEditor, input.at);

    if (options?.dryRun) {
      const canInsert = storyEditor.can().insertHeadingAt?.({
        pos: insertAt,
        level: input.level,
        text: input.text,
        tracked: mode === 'tracked',
      });

      if (!canInsert) {
        return {
          success: false,
          failure: {
            code: 'INVALID_TARGET',
            message: 'Heading creation could not be applied at the requested location.',
          },
        };
      }

      return {
        success: true,
        heading: {
          kind: 'block',
          nodeType: 'heading',
          nodeId: '(dry-run)',
        },
        insertionPoint: {
          kind: 'text',
          blockId: '(dry-run)',
          range: { start: 0, end: 0 },
        },
      };
    }

    const headingId = uuidv4();
    let canonicalId = headingId;
    let trackedChangeRefs: CreateHeadingSuccessResult['trackedChangeRefs'] | undefined;

    const receipt = executeDomainCommand(
      storyEditor,
      () => {
        const didApply = insertHeadingAt({
          pos: insertAt,
          level: input.level,
          text: input.text,
          sdBlockId: headingId,
          tracked: mode === 'tracked',
        });
        if (didApply) {
          clearIndexCache(storyEditor);
          try {
            const heading = resolveCreatedBlock(storyEditor, 'heading', headingId);
            canonicalId = heading.nodeId;
            if (mode === 'tracked') {
              trackedChangeRefs = collectTrackInsertRefsInRange(storyEditor, heading.pos, heading.end);
            }
          } catch (e) {
            if (!(e instanceof DocumentApiAdapterError)) throw e;
          }
        }
        return didApply;
      },
      { expectedRevision: options?.expectedRevision },
    );

    if (receipt.steps[0]?.effect !== 'changed') {
      return {
        success: false,
        failure: {
          code: 'INVALID_TARGET',
          message: 'Heading creation could not be applied at the requested location.',
        },
      };
    }

    if (runtime.commit) runtime.commit(editor);

    // Auto-apply fontFamily + color from nearby blocks so the heading
    // matches the document's visual style without extra LLM format steps.
    // Skip fontSize — headings should keep their style-level size.
    try {
      if (input.text) {
        const formatting = findNearbyFormatting(storyEditor, insertAt, true);
        if (formatting) {
          const { fontSize: _skipSize, ...headingFormatting } = formatting;
          applyFormattingToCreatedBlock(storyEditor, headingId, headingFormatting);
        }
      }
    } catch (e) {
      // Best-effort — formatting failure should not break creation
      console.warn('[create-wrapper] auto-formatting failed:', e);
    }

    const nonBodyStory = runtime.kind !== 'body' ? runtime.locator : undefined;
    const textLen = input.text?.length ?? 0;
    const ref = textLen > 0 ? mintBlockRef(storyEditor, runtime.storyKey, canonicalId, textLen) : undefined;
    return buildHeadingCreateSuccess(canonicalId, trackedChangeRefs, nonBodyStory, ref);
  } finally {
    disposeEphemeralWriteRuntime(runtime);
  }
}
