import { v4 as uuidv4 } from 'uuid';
import type { Editor } from '../core/Editor.js';
import type {
  CreateParagraphInput,
  CreateParagraphResult,
  CreateParagraphSuccessResult,
  MutationOptions,
} from '@superdoc/document-api';
import { clearIndexCache, getBlockIndex } from './helpers/index-cache.js';
import { findBlockById, type BlockCandidate } from './helpers/node-address-resolver.js';
import { collectTrackInsertRefsInRange } from './helpers/tracked-change-refs.js';
import { DocumentApiAdapterError } from './errors.js';
import { requireEditorCommand, ensureTrackedCapability } from './helpers/mutation-helpers.js';

type InsertParagraphAtCommandOptions = {
  pos: number;
  text?: string;
  sdBlockId?: string;
  tracked?: boolean;
};

type InsertParagraphAtCommand = (options: InsertParagraphAtCommandOptions) => boolean;

function resolveParagraphInsertPosition(editor: Editor, input: CreateParagraphInput): number {
  const location = input.at ?? { kind: 'documentEnd' };

  if (location.kind === 'documentStart') return 0;
  if (location.kind === 'documentEnd') return editor.state.doc.content.size;

  const index = getBlockIndex(editor);
  const target = findBlockById(index, location.target);
  if (!target) {
    throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'Create paragraph target block was not found.', {
      target: location.target,
    });
  }

  return location.kind === 'before' ? target.pos : target.end;
}

function resolveCreatedParagraph(editor: Editor, paragraphId: string): BlockCandidate {
  const index = getBlockIndex(editor);
  const resolved = index.byId.get(`paragraph:${paragraphId}`);

  if (resolved) return resolved;

  // Paragraph addresses may currently prefer imported paraId over sdBlockId.
  // After insertion, resolve by sdBlockId as a deterministic fallback so a
  // successful insert cannot be reported as a failure solely due to ID
  // projection differences.
  const bySdBlockId = index.candidates.find((candidate) => {
    if (candidate.nodeType !== 'paragraph') return false;
    const attrs = (candidate.node as { attrs?: { sdBlockId?: unknown } }).attrs;
    return typeof attrs?.sdBlockId === 'string' && attrs.sdBlockId === paragraphId;
  });
  if (bySdBlockId) return bySdBlockId;

  const fallback = index.candidates.find(
    (candidate) => candidate.nodeType === 'paragraph' && candidate.nodeId === paragraphId,
  );
  if (fallback) return fallback;

  throw new DocumentApiAdapterError('TARGET_NOT_FOUND', 'Created paragraph could not be resolved after insertion.', {
    paragraphId,
  });
}

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

export function createParagraphAdapter(
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

  const insertAt = resolveParagraphInsertPosition(editor, input);

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

  const didApply = insertParagraphAt({
    pos: insertAt,
    text: input.text,
    sdBlockId: paragraphId,
    tracked: mode === 'tracked',
  });

  if (!didApply) {
    return {
      success: false,
      failure: {
        code: 'INVALID_TARGET',
        message: 'Paragraph creation could not be applied at the requested location.',
      },
    };
  }

  clearIndexCache(editor);
  try {
    const paragraph = resolveCreatedParagraph(editor, paragraphId);
    const trackedChangeRefs =
      mode === 'tracked' ? collectTrackInsertRefsInRange(editor, paragraph.pos, paragraph.end) : undefined;

    return buildParagraphCreateSuccess(paragraph.nodeId, trackedChangeRefs);
  } catch {
    // Mutation already applied — contract requires success: true.
    // Fall back to the generated ID we assigned to the command.
    return buildParagraphCreateSuccess(paragraphId);
  }
}
