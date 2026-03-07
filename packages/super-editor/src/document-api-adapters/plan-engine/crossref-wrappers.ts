/**
 * Cross-reference plan-engine wrappers — bridge crossRefs.* operations.
 */

import type { Editor } from '../../core/Editor.js';
import type {
  CrossRefListInput,
  CrossRefGetInput,
  CrossRefInsertInput,
  CrossRefRebuildInput,
  CrossRefRemoveInput,
  CrossRefInfo,
  CrossRefMutationResult,
  CrossRefAddress,
  MutationOptions,
  ReceiptFailureCode,
} from '@superdoc/document-api';
import { buildDiscoveryResult } from '@superdoc/document-api';
import {
  findAllCrossRefs,
  resolveCrossRefTarget,
  extractCrossRefInfo,
  buildCrossRefDiscoveryItem,
} from '../helpers/crossref-resolver.js';
import { paginate, resolveInlineInsertPosition } from '../helpers/adapter-utils.js';
import { getRevision } from './revision-tracker.js';
import { executeDomainCommand } from './plan-wrappers.js';
import { rejectTrackedMode } from '../helpers/mutation-helpers.js';
import { clearIndexCache } from '../helpers/index-cache.js';
import { DocumentApiAdapterError } from '../errors.js';

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

function crossRefSuccess(address: CrossRefAddress): CrossRefMutationResult {
  return { success: true, crossRef: address };
}

function crossRefFailure(code: ReceiptFailureCode, message: string): CrossRefMutationResult {
  return { success: false, failure: { code, message } };
}

function receiptApplied(receipt: ReturnType<typeof executeDomainCommand>): boolean {
  return receipt.steps[0]?.effect === 'changed';
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export function crossRefsListWrapper(editor: Editor, query?: CrossRefListInput) {
  const doc = editor.state.doc;
  const revision = getRevision(editor);
  const crossRefs = findAllCrossRefs(doc);

  const allItems = crossRefs.map((c) => buildCrossRefDiscoveryItem(doc, c, revision));
  const { total, items: paged } = paginate(allItems, query?.offset, query?.limit);
  const effectiveLimit = query?.limit ?? total;

  return buildDiscoveryResult({
    evaluatedRevision: revision,
    total,
    items: paged,
    page: { limit: effectiveLimit, offset: query?.offset ?? 0, returned: paged.length },
  });
}

export function crossRefsGetWrapper(editor: Editor, input: CrossRefGetInput): CrossRefInfo {
  const resolved = resolveCrossRefTarget(editor.state.doc, input.target);
  return extractCrossRefInfo(editor.state.doc, resolved);
}

// ---------------------------------------------------------------------------
// Mutation operations
// ---------------------------------------------------------------------------

export function crossRefsInsertWrapper(
  editor: Editor,
  input: CrossRefInsertInput,
  options?: MutationOptions,
): CrossRefMutationResult {
  rejectTrackedMode('crossRefs.insert', options);

  const dummyAddress: CrossRefAddress = {
    kind: 'inline',
    nodeType: 'crossRef',
    anchor: { start: { blockId: '', offset: 0 }, end: { blockId: '', offset: 0 } },
  };

  if (options?.dryRun) return crossRefSuccess(dummyAddress);

  const crossRefType = editor.schema.nodes.crossReference;
  if (!crossRefType) {
    throw new DocumentApiAdapterError(
      'CAPABILITY_UNAVAILABLE',
      'crossRefs.insert: crossReference node type not in schema.',
    );
  }

  const resolved = resolveInlineInsertPosition(editor, input.at, 'crossRefs.insert');

  const receipt = executeDomainCommand(
    editor,
    (): boolean => {
      const instruction = buildRefInstruction(input);
      const targetName = extractTargetName(input.target);
      const node = crossRefType.create({
        instruction,
        target: targetName,
        fieldType:
          input.target.kind === 'note' ? 'NOTEREF' : input.target.kind === 'styledParagraph' ? 'STYLEREF' : 'REF',
        display: input.display ?? 'content',
        resolvedText: '',
      });
      const { tr } = editor.state;
      tr.insert(resolved.from, node);
      editor.dispatch(tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) return crossRefFailure('NO_OP', 'Insert produced no change.');

  return crossRefSuccess(computeInlineAddress(editor.state.doc, resolved.from));
}

export function crossRefsRebuildWrapper(
  editor: Editor,
  input: CrossRefRebuildInput,
  options?: MutationOptions,
): CrossRefMutationResult {
  rejectTrackedMode('crossRefs.rebuild', options);

  const resolved = resolveCrossRefTarget(editor.state.doc, input.target);
  const address = extractCrossRefInfo(editor.state.doc, resolved).address;

  if (options?.dryRun) return crossRefSuccess(address);

  // Rebuild defers to layout engine for display text re-resolution
  return crossRefSuccess(address);
}

export function crossRefsRemoveWrapper(
  editor: Editor,
  input: CrossRefRemoveInput,
  options?: MutationOptions,
): CrossRefMutationResult {
  rejectTrackedMode('crossRefs.remove', options);

  const resolved = resolveCrossRefTarget(editor.state.doc, input.target);
  const address = extractCrossRefInfo(editor.state.doc, resolved).address;

  if (options?.dryRun) return crossRefSuccess(address);

  const receipt = executeDomainCommand(
    editor,
    () => {
      const { tr } = editor.state;
      tr.delete(resolved.pos, resolved.pos + resolved.node.nodeSize);
      editor.dispatch(tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) return crossRefFailure('NO_OP', 'Remove produced no change.');
  return crossRefSuccess(address);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeInlineAddress(doc: import('prosemirror-model').Node, pos: number): CrossRefAddress {
  const node = doc.nodeAt?.(pos);
  if (!node || typeof doc.resolve !== 'function') {
    return {
      kind: 'inline',
      nodeType: 'crossRef',
      anchor: { start: { blockId: '', offset: pos }, end: { blockId: '', offset: pos + (node?.nodeSize ?? 1) } },
    };
  }
  const r = doc.resolve(pos);
  let blockId = '';
  for (let depth = r.depth; depth >= 0; depth--) {
    const bid = r.node(depth).attrs?.sdBlockId as string | undefined;
    if (bid) {
      blockId = bid;
      break;
    }
  }
  const offset = pos - r.start(r.depth);
  return {
    kind: 'inline',
    nodeType: 'crossRef',
    anchor: {
      start: { blockId, offset },
      end: { blockId, offset: offset + node.nodeSize },
    },
  };
}

function extractTargetName(target: CrossRefInsertInput['target']): string {
  switch (target.kind) {
    case 'bookmark':
      return target.name;
    case 'heading':
      return target.nodeId;
    case 'note':
      return target.noteId;
    case 'caption':
      return target.nodeId;
    case 'numberedItem':
      return target.nodeId;
    case 'styledParagraph':
      return target.styleName;
  }
}

function buildRefInstruction(input: CrossRefInsertInput): string {
  const targetName = extractTargetName(input.target);
  const fieldType =
    input.target.kind === 'note' ? 'NOTEREF' : input.target.kind === 'styledParagraph' ? 'STYLEREF' : 'REF';
  const parts = [fieldType, targetName];
  if (input.display === 'pageNumber') parts.push('\\p');
  if (input.display === 'aboveBelow') parts.push('\\p');
  if (input.display === 'numberOnly') parts.push('\\n');
  if (input.display === 'numberFullContext') parts.push('\\w');
  parts.push('\\h');
  return parts.join(' ');
}
