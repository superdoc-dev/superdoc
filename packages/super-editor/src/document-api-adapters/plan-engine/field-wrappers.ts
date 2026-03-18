/**
 * Field plan-engine wrappers — bridge fields.* operations (generic field escape hatch).
 */

import type { Editor } from '../../core/Editor.js';
import type {
  FieldListInput,
  FieldGetInput,
  FieldInsertInput,
  FieldRebuildInput,
  FieldRemoveInput,
  FieldInfo,
  FieldMutationResult,
  FieldAddress,
  MutationOptions,
  ReceiptFailureCode,
} from '@superdoc/document-api';
import { buildDiscoveryResult } from '@superdoc/document-api';
import {
  findAllFields,
  resolveFieldTarget,
  extractFieldInfo,
  buildFieldDiscoveryItem,
} from '../helpers/field-resolver.js';
import { paginate, resolveInlineInsertPosition } from '../helpers/adapter-utils.js';
import { getRevision } from './revision-tracker.js';
import { executeDomainCommand } from './plan-wrappers.js';
import { rejectTrackedMode } from '../helpers/mutation-helpers.js';
import { clearIndexCache } from '../helpers/index-cache.js';
import { DocumentApiAdapterError } from '../errors.js';

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

function fieldSuccess(address: FieldAddress): FieldMutationResult {
  return { success: true, field: address };
}

function fieldFailure(code: ReceiptFailureCode, message: string): FieldMutationResult {
  return { success: false, failure: { code, message } };
}

function receiptApplied(receipt: ReturnType<typeof executeDomainCommand>): boolean {
  return receipt.steps[0]?.effect === 'changed';
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export function fieldsListWrapper(editor: Editor, query?: FieldListInput) {
  const doc = editor.state.doc;
  const revision = getRevision(editor);
  const fields = findAllFields(doc);

  const allItems = fields.map((f) => buildFieldDiscoveryItem(f, revision));
  const { total, items: paged } = paginate(allItems, query?.offset, query?.limit);
  const effectiveLimit = query?.limit ?? total;

  return buildDiscoveryResult({
    evaluatedRevision: revision,
    total,
    items: paged,
    page: { limit: effectiveLimit, offset: query?.offset ?? 0, returned: paged.length },
  });
}

export function fieldsGetWrapper(editor: Editor, input: FieldGetInput): FieldInfo {
  const resolved = resolveFieldTarget(editor.state.doc, input.target);
  return extractFieldInfo(resolved);
}

// ---------------------------------------------------------------------------
// Mutation operations
// ---------------------------------------------------------------------------

export function fieldsInsertWrapper(
  editor: Editor,
  input: FieldInsertInput,
  options?: MutationOptions,
): FieldMutationResult {
  rejectTrackedMode('fields.insert', options);

  if (input.mode !== 'raw') {
    throw new DocumentApiAdapterError('INVALID_INPUT', 'fields.insert requires mode: "raw".');
  }

  const address: FieldAddress = {
    kind: 'field',
    blockId: '',
    occurrenceIndex: 0,
    nestingDepth: 0,
  };

  if (options?.dryRun) return fieldSuccess(address);

  // Find a field node type in the schema that accepts an instruction attribute.
  // sequenceField is the generic raw-field container.
  const fieldNodeType = editor.schema.nodes.sequenceField;
  if (!fieldNodeType) {
    throw new DocumentApiAdapterError(
      'CAPABILITY_UNAVAILABLE',
      'fields.insert: sequenceField node type not in schema.',
    );
  }

  const resolved = resolveInlineInsertPosition(editor, input.at, 'fields.insert');

  const receipt = executeDomainCommand(
    editor,
    (): boolean => {
      const fieldType = extractFieldType(input.instruction);
      const node = fieldNodeType.create({
        instruction: input.instruction,
        identifier: fieldType,
        format: 'ARABIC',
        resolvedNumber: '',
        sdBlockId: `field-${Date.now()}`,
      });
      const { tr } = editor.state;
      tr.insert(resolved.from, node);
      editor.dispatch(tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) return fieldFailure('NO_OP', 'Insert produced no change.');

  return fieldSuccess(computeFieldAddress(editor.state.doc, resolved.from));
}

export function fieldsRebuildWrapper(
  editor: Editor,
  input: FieldRebuildInput,
  options?: MutationOptions,
): FieldMutationResult {
  rejectTrackedMode('fields.rebuild', options);

  const resolved = resolveFieldTarget(editor.state.doc, input.target);
  const address: FieldAddress = {
    kind: 'field',
    blockId: resolved.blockId,
    occurrenceIndex: resolved.occurrenceIndex,
    nestingDepth: resolved.nestingDepth,
  };

  if (options?.dryRun) return fieldSuccess(address);

  // Rebuild triggers re-evaluation by touching the node's attrs (sets a dirty
  // flag so the layout engine will recalculate the field result on next pass).
  const receipt = executeDomainCommand(
    editor,
    () => {
      const { tr } = editor.state;
      const node = tr.doc.nodeAt(resolved.pos);
      if (!node) return false;
      tr.setNodeMarkup(resolved.pos, undefined, {
        ...node.attrs,
        resolvedNumber: '', // clear cached result to force re-evaluation
      });
      editor.dispatch(tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) return fieldFailure('NO_OP', 'Rebuild produced no change.');
  return fieldSuccess(address);
}

export function fieldsRemoveWrapper(
  editor: Editor,
  input: FieldRemoveInput,
  options?: MutationOptions,
): FieldMutationResult {
  rejectTrackedMode('fields.remove', options);

  if (input.mode !== 'raw') {
    throw new DocumentApiAdapterError('INVALID_INPUT', 'fields.remove requires mode: "raw".');
  }

  const resolved = resolveFieldTarget(editor.state.doc, input.target);
  const address: FieldAddress = {
    kind: 'field',
    blockId: resolved.blockId,
    occurrenceIndex: resolved.occurrenceIndex,
    nestingDepth: resolved.nestingDepth,
  };

  if (options?.dryRun) return fieldSuccess(address);

  const receipt = executeDomainCommand(
    editor,
    () => {
      const { tr } = editor.state;
      const node = tr.doc.nodeAt(resolved.pos);
      if (!node) return false;
      tr.delete(resolved.pos, resolved.pos + node.nodeSize);
      editor.dispatch(tr);
      clearIndexCache(editor);
      return true;
    },
    { expectedRevision: options?.expectedRevision },
  );

  if (!receiptApplied(receipt)) return fieldFailure('NO_OP', 'Remove produced no change.');
  return fieldSuccess(address);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeFieldAddress(doc: import('prosemirror-model').Node, pos: number): FieldAddress {
  const node = doc.nodeAt?.(pos);
  if (!node || typeof doc.resolve !== 'function') {
    return { kind: 'field', blockId: '', occurrenceIndex: 0, nestingDepth: 0 };
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
  // Count field-like nodes in the same block before this position
  const blockStart = r.start(r.depth);
  let occurrenceIndex = 0;
  doc.nodesBetween(blockStart, pos, (n) => {
    if (n.attrs?.instruction && n !== doc) occurrenceIndex++;
    return true;
  });
  return { kind: 'field', blockId, occurrenceIndex, nestingDepth: 0 };
}

function extractFieldType(instruction: string): string {
  const trimmed = instruction.trim();
  const firstSpace = trimmed.indexOf(' ');
  return firstSpace > 0 ? trimmed.slice(0, firstSpace).toUpperCase() : trimmed.toUpperCase();
}
