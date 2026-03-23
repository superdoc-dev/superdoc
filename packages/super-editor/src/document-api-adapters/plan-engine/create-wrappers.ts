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
  };
}

function buildHeadingCreateSuccess(
  headingNodeId: string,
  trackedChangeRefs?: CreateHeadingSuccessResult['trackedChangeRefs'],
  story?: StoryLocator,
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
    const nonBodyStory = runtime.kind !== 'body' ? runtime.locator : undefined;
    return buildParagraphCreateSuccess(canonicalId, trackedChangeRefs, nonBodyStory);
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
    const nonBodyStory = runtime.kind !== 'body' ? runtime.locator : undefined;
    return buildHeadingCreateSuccess(canonicalId, trackedChangeRefs, nonBodyStory);
  } finally {
    disposeEphemeralWriteRuntime(runtime);
  }
}
