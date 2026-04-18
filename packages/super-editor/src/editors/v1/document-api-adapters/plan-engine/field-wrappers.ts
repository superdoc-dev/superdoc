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
import { getWordStatistics, resolveDocumentStatFieldValue, resolveMainBodyEditor } from '../helpers/word-statistics.js';

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

/** Field types that use the documentStatField node representation. */
const DOCUMENT_STAT_FIELD_TYPES = new Set(['NUMWORDS', 'NUMCHARS']);

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

  const fieldType = extractFieldType(input.instruction);
  const resolved = resolveInlineInsertPosition(editor, input.at, 'fields.insert');

  // Route insertion by field type
  if (DOCUMENT_STAT_FIELD_TYPES.has(fieldType)) {
    return insertDocumentStatField(editor, input, resolved, options);
  }

  if (fieldType === 'NUMPAGES') {
    return insertNumPagesField(editor, resolved, options);
  }

  return insertRawField(editor, input, resolved, options);
}

function insertDocumentStatField(
  editor: Editor,
  input: FieldInsertInput,
  resolved: { from: number },
  options?: MutationOptions,
): FieldMutationResult {
  const nodeType = editor.schema.nodes.documentStatField;
  if (!nodeType) {
    throw new DocumentApiAdapterError(
      'CAPABILITY_UNAVAILABLE',
      'fields.insert: documentStatField node type not in schema.',
    );
  }

  // Stat fields always display document-level counts. When the editor is a
  // header/footer sub-editor, resolve the main body editor for correct scope.
  const statsEditor = resolveMainBodyEditor(editor);
  const stats = getWordStatistics(statsEditor);
  const fieldType = extractFieldType(input.instruction);
  const initialValue = resolveDocumentStatFieldValue(fieldType, stats) ?? '';

  const receipt = executeDomainCommand(
    editor,
    (): boolean => {
      const node = nodeType.create({
        instruction: input.instruction,
        resolvedText: initialValue,
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

function insertNumPagesField(
  editor: Editor,
  resolved: { from: number },
  options?: MutationOptions,
): FieldMutationResult {
  // NUMPAGES insertion is restricted to headers/footers (existing product restriction).
  const isHeaderOrFooter = Boolean((editor as any).options?.isHeaderOrFooter);
  if (!isHeaderOrFooter) {
    return fieldFailure('INVALID_INPUT', 'fields.insert: NUMPAGES insertion is only supported in headers/footers.');
  }

  const nodeType = editor.schema.nodes['total-page-number'];
  if (!nodeType) {
    throw new DocumentApiAdapterError(
      'CAPABILITY_UNAVAILABLE',
      'fields.insert: total-page-number node type not in schema.',
    );
  }

  const receipt = executeDomainCommand(
    editor,
    (): boolean => {
      const node = nodeType.create({});
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

function insertRawField(
  editor: Editor,
  input: FieldInsertInput,
  resolved: { from: number },
  options?: MutationOptions,
): FieldMutationResult {
  const fieldNodeType = editor.schema.nodes.sequenceField;
  if (!fieldNodeType) {
    throw new DocumentApiAdapterError(
      'CAPABILITY_UNAVAILABLE',
      'fields.insert: sequenceField node type not in schema.',
    );
  }

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

  const node = editor.state.doc.nodeAt(resolved.pos);
  if (!node) return fieldFailure('TARGET_NOT_FOUND', 'Node not found at resolved position.');

  // Dispatch to the appropriate rebuild strategy based on node type
  if (node.type.name === 'documentStatField') {
    return rebuildDocumentStatField(editor, resolved, address, options);
  }

  if (node.type.name === 'total-page-number') {
    return rebuildTotalPageNumber(editor, resolved, address, options);
  }

  // Default: clear resolvedNumber to force re-evaluation (sequence fields, etc.)
  const receipt = executeDomainCommand(
    editor,
    () => {
      const { tr } = editor.state;
      const currentNode = tr.doc.nodeAt(resolved.pos);
      if (!currentNode) return false;
      tr.setNodeMarkup(resolved.pos, undefined, {
        ...currentNode.attrs,
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

/**
 * Rebuilds a documentStatField by recomputing its value from the Word-statistics helper.
 */
function rebuildDocumentStatField(
  editor: Editor,
  resolved: { pos: number },
  address: FieldAddress,
  options?: MutationOptions,
): FieldMutationResult {
  // Stat fields always display document-level counts, not sub-editor counts.
  const statsEditor = resolveMainBodyEditor(editor);
  const stats = getWordStatistics(statsEditor);
  const node = editor.state.doc.nodeAt(resolved.pos);
  if (!node) return fieldFailure('TARGET_NOT_FOUND', 'Node not found.');

  const fieldType = extractFieldType((node.attrs?.instruction as string) ?? '');
  const freshValue = resolveDocumentStatFieldValue(fieldType, stats) ?? '';

  const receipt = executeDomainCommand(
    editor,
    () => {
      const { tr } = editor.state;
      const currentNode = tr.doc.nodeAt(resolved.pos);
      if (!currentNode) return false;
      tr.setNodeMarkup(resolved.pos, undefined, {
        ...currentNode.attrs,
        resolvedText: freshValue,
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

/**
 * Rebuilds a total-page-number field by writing the current page count
 * into both resolvedText and the node's text content.
 *
 * When pagination is unavailable, the cached value is the best we have —
 * return success without modifying the node.
 */
function rebuildTotalPageNumber(
  editor: Editor,
  resolved: { pos: number },
  address: FieldAddress,
  options?: MutationOptions,
): FieldMutationResult {
  const statsEditor = resolveMainBodyEditor(editor);
  const stats = getWordStatistics(statsEditor);

  if (stats.pages == null) return fieldSuccess(address);

  const freshValue = String(stats.pages);

  const receipt = executeDomainCommand(
    editor,
    () => {
      const { tr } = editor.state;
      const currentNode = tr.doc.nodeAt(resolved.pos);
      if (!currentNode) return false;

      // Replace the entire node to keep text content and resolvedText in sync.
      const textChild = freshValue ? editor.schema.text(freshValue) : null;
      const newNode = currentNode.type.create({ ...currentNode.attrs, resolvedText: freshValue }, textChild);
      tr.replaceWith(resolved.pos, resolved.pos + currentNode.nodeSize, newNode);
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
