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
} from '@superdoc/document-api';
import { clearIndexCache, getBlockIndex } from '../helpers/index-cache.js';
import { findBlockById, type BlockCandidate } from '../helpers/node-address-resolver.js';
import { collectTrackInsertRefsInRange } from '../helpers/tracked-change-refs.js';
import { DocumentApiAdapterError } from '../errors.js';
import { requireEditorCommand, ensureTrackedCapability } from '../helpers/mutation-helpers.js';
import { executeDomainCommand } from './plan-wrappers.js';

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
  operationLabel: string,
): number {
  const location = at ?? { kind: 'documentEnd' };

  if (location.kind === 'documentStart') return 0;
  if (location.kind === 'documentEnd') return editor.state.doc.content.size;

  const index = getBlockIndex(editor);
  const target = findBlockById(index, location.target);
  if (!target) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', `Create ${operationLabel} target block was not found.`, {
      target: location.target,
    });
  }

  return location.kind === 'before' ? target.pos : target.end;
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
): CreateParagraphSuccessResult {
  return {
    success: true,
    paragraph: {
      kind: 'block',
      nodeType: 'paragraph',
      nodeId: paragraphNodeId,
    },
    insertionPoint: {
      kind: 'text',
      blockId: paragraphNodeId,
      range: { start: 0, end: 0 },
    },
    trackedChangeRefs,
  };
}

function buildHeadingCreateSuccess(
  headingNodeId: string,
  trackedChangeRefs?: CreateHeadingSuccessResult['trackedChangeRefs'],
): CreateHeadingSuccessResult {
  return {
    success: true,
    heading: {
      kind: 'block',
      nodeType: 'heading',
      nodeId: headingNodeId,
    },
    insertionPoint: {
      kind: 'text',
      blockId: headingNodeId,
      range: { start: 0, end: 0 },
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
  const insertParagraphAt = requireEditorCommand(
    editor.commands?.insertParagraphAt,
    'create.paragraph',
  ) as InsertParagraphAtCommand;
  const mode = options?.changeMode ?? 'direct';

  if (mode === 'tracked') {
    ensureTrackedCapability(editor, { operation: 'create.paragraph' });
  }

  const insertAt = resolveCreateInsertPosition(editor, input.at, 'paragraph');

  if (options?.dryRun) {
    const canInsert = editor.can().insertParagraphAt?.({
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
  let trackedChangeRefs: CreateParagraphSuccessResult['trackedChangeRefs'] | undefined;

  const receipt = executeDomainCommand(
    editor,
    () => {
      const didApply = insertParagraphAt({
        pos: insertAt,
        text: input.text,
        sdBlockId: paragraphId,
        tracked: mode === 'tracked',
      });
      if (didApply) {
        clearIndexCache(editor);
        try {
          const paragraph = resolveCreatedBlock(editor, 'paragraph', paragraphId);
          if (mode === 'tracked') {
            trackedChangeRefs = collectTrackInsertRefsInRange(editor, paragraph.pos, paragraph.end);
          }
        } catch {
          /* will use fallback */
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

  return buildParagraphCreateSuccess(paragraphId, trackedChangeRefs);
}

// ---------------------------------------------------------------------------
// create.heading wrapper
// ---------------------------------------------------------------------------

export function createHeadingWrapper(
  editor: Editor,
  input: CreateHeadingInput,
  options?: MutationOptions,
): CreateHeadingResult {
  const insertHeadingAt = requireEditorCommand(
    editor.commands?.insertHeadingAt,
    'create.heading',
  ) as InsertHeadingAtCommand;
  const mode = options?.changeMode ?? 'direct';

  if (mode === 'tracked') {
    ensureTrackedCapability(editor, { operation: 'create.heading' });
  }

  const insertAt = resolveCreateInsertPosition(editor, input.at, 'heading');

  if (options?.dryRun) {
    const canInsert = editor.can().insertHeadingAt?.({
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
  let trackedChangeRefs: CreateHeadingSuccessResult['trackedChangeRefs'] | undefined;

  const receipt = executeDomainCommand(
    editor,
    () => {
      const didApply = insertHeadingAt({
        pos: insertAt,
        level: input.level,
        text: input.text,
        sdBlockId: headingId,
        tracked: mode === 'tracked',
      });
      if (didApply) {
        clearIndexCache(editor);
        try {
          const heading = resolveCreatedBlock(editor, 'heading', headingId);
          if (mode === 'tracked') {
            trackedChangeRefs = collectTrackInsertRefsInRange(editor, heading.pos, heading.end);
          }
        } catch {
          /* will use fallback */
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

  return buildHeadingCreateSuccess(headingId, trackedChangeRefs);
}
