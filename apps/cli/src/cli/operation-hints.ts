/**
 * CLI-local metadata for each exposed doc-backed operation.
 *
 * Drives the generic dispatch path — orchestrator selection, success messaging,
 * output formatting, response envelope key, and error-mapping family.
 *
 * All tables are keyed by CliExposedOperationId. A missing entry is a compile
 * error — TypeScript enforces completeness. When a new operation is added to
 * OPERATION_DEFINITIONS, the CLI requires only a one-line entry in each table.
 */

import { COMMAND_CATALOG } from '@superdoc/document-api';
import type { CliExposedOperationId } from './operation-set.js';

// ---------------------------------------------------------------------------
// Orchestration kind (derived from COMMAND_CATALOG)
// ---------------------------------------------------------------------------

/** Which orchestrator to use: read or mutation. Derived from COMMAND_CATALOG. */
export function orchestrationKind(opId: CliExposedOperationId): 'read' | 'mutation' {
  return COMMAND_CATALOG[opId].mutates ? 'mutation' : 'read';
}

// ---------------------------------------------------------------------------
// Success verb (past-tense for pretty output)
// ---------------------------------------------------------------------------

/** Past-tense verb for success messages. */
export const SUCCESS_VERB: Record<CliExposedOperationId, string> = {
  find: 'completed search',
  getNode: 'resolved node',
  getNodeById: 'resolved node',
  getText: 'extracted text',
  info: 'retrieved info',
  insert: 'inserted text',
  replace: 'replaced text',
  delete: 'deleted text',
  'blocks.delete': 'deleted block',
  'format.apply': 'applied style',
  'format.fontSize': 'set font size',
  'format.fontFamily': 'set font family',
  'format.color': 'set text color',
  'format.align': 'set alignment',
  'create.paragraph': 'created paragraph',
  'create.heading': 'created heading',
  'lists.list': 'listed items',
  'lists.get': 'resolved list item',
  'lists.insert': 'inserted list item',
  'lists.setType': 'set list type',
  'lists.indent': 'indented list item',
  'lists.outdent': 'outdented list item',
  'lists.restart': 'restarted list numbering',
  'lists.exit': 'exited list item',
  'comments.create': 'created comment',
  'comments.patch': 'patched comment',
  'comments.delete': 'deleted comment',
  'comments.get': 'resolved comment',
  'comments.list': 'listed comments',
  'trackChanges.list': 'listed tracked changes',
  'trackChanges.get': 'resolved tracked change',
  'trackChanges.decide': 'reviewed tracked change',
  'query.match': 'matched selectors',
  'mutations.preview': 'previewed mutations',
  'mutations.apply': 'applied mutations',
  'capabilities.get': 'retrieved capabilities',
};

// ---------------------------------------------------------------------------
// Output format (selects the pretty-printer)
// ---------------------------------------------------------------------------

export type OutputFormat =
  | 'queryResult'
  | 'nodeInfo'
  | 'mutationReceipt'
  | 'createResult'
  | 'listResult'
  | 'listItemInfo'
  | 'listsMutationResult'
  | 'commentInfo'
  | 'commentList'
  | 'commentReceipt'
  | 'trackChangeInfo'
  | 'trackChangeList'
  | 'trackChangeMutationReceipt'
  | 'documentInfo'
  | 'receipt'
  | 'plain'
  | 'void';

export const OUTPUT_FORMAT: Record<CliExposedOperationId, OutputFormat> = {
  find: 'queryResult',
  getNode: 'nodeInfo',
  getNodeById: 'nodeInfo',
  getText: 'plain',
  info: 'documentInfo',
  insert: 'mutationReceipt',
  replace: 'mutationReceipt',
  delete: 'mutationReceipt',
  'blocks.delete': 'plain',
  'format.apply': 'mutationReceipt',
  'format.fontSize': 'mutationReceipt',
  'format.fontFamily': 'mutationReceipt',
  'format.color': 'mutationReceipt',
  'format.align': 'mutationReceipt',
  'create.paragraph': 'createResult',
  'create.heading': 'createResult',
  'lists.list': 'listResult',
  'lists.get': 'listItemInfo',
  'lists.insert': 'listsMutationResult',
  'lists.setType': 'listsMutationResult',
  'lists.indent': 'listsMutationResult',
  'lists.outdent': 'listsMutationResult',
  'lists.restart': 'listsMutationResult',
  'lists.exit': 'listsMutationResult',
  'comments.create': 'commentReceipt',
  'comments.patch': 'commentReceipt',
  'comments.delete': 'commentReceipt',
  'comments.get': 'commentInfo',
  'comments.list': 'commentList',
  'trackChanges.list': 'trackChangeList',
  'trackChanges.get': 'trackChangeInfo',
  'trackChanges.decide': 'trackChangeMutationReceipt',
  'query.match': 'plain',
  'mutations.preview': 'plain',
  'mutations.apply': 'plain',
  'capabilities.get': 'plain',
};

// ---------------------------------------------------------------------------
// Response envelope key (single source of truth)
// ---------------------------------------------------------------------------

/**
 * Envelope key where the doc-api result payload lives in the CLI response.
 * This is the SINGLE SOURCE OF TRUTH — used by both orchestrators
 * and validateOperationResponseData().
 *
 * `null` means the result is spread across multiple top-level keys (e.g. info).
 */
export const RESPONSE_ENVELOPE_KEY: Record<CliExposedOperationId, string | null> = {
  find: 'result',
  getNode: 'node',
  getNodeById: 'node',
  getText: 'text',
  info: null,
  insert: null,
  replace: null,
  delete: null,
  'blocks.delete': 'result',
  'format.apply': null,
  'format.fontSize': null,
  'format.fontFamily': null,
  'format.color': null,
  'format.align': null,
  'create.paragraph': 'result',
  'create.heading': 'result',
  'lists.list': 'result',
  'lists.get': 'item',
  'lists.insert': 'result',
  'lists.setType': 'result',
  'lists.indent': 'result',
  'lists.outdent': 'result',
  'lists.restart': 'result',
  'lists.exit': 'result',
  'comments.create': 'receipt',
  'comments.patch': 'receipt',
  'comments.delete': 'receipt',
  'comments.get': 'comment',
  'comments.list': 'result',
  'trackChanges.list': 'result',
  'trackChanges.get': 'change',
  'trackChanges.decide': 'receipt',
  'query.match': 'result',
  'mutations.preview': 'result',
  'mutations.apply': 'result',
  'capabilities.get': 'capabilities',
};

// ---------------------------------------------------------------------------
// Response validation key (fallback for null envelope keys)
// ---------------------------------------------------------------------------

/**
 * When RESPONSE_ENVELOPE_KEY is `null` (result is spread across top-level keys),
 * this map specifies which key to validate against the doc-api output schema.
 *
 * Operations without an entry here AND a null envelope key skip schema validation
 * (e.g. `info`, which splits output across counts/outline/capabilities).
 */
export const RESPONSE_VALIDATION_KEY: Partial<Record<CliExposedOperationId, string>> = {
  insert: 'receipt',
  replace: 'receipt',
  delete: 'receipt',
  'format.apply': 'receipt',
  'format.fontSize': 'receipt',
  'format.fontFamily': 'receipt',
  'format.color': 'receipt',
  'format.align': 'receipt',
};

// ---------------------------------------------------------------------------
// Operation family (determines error-mapping rules)
// ---------------------------------------------------------------------------

/**
 * Operation family — determines which error-mapping rules apply.
 * Explicit Record for compile-time completeness (no string-prefix heuristics).
 */
export type OperationFamily =
  | 'trackChanges'
  | 'comments'
  | 'lists'
  | 'textMutation'
  | 'create'
  | 'blocks'
  | 'query'
  | 'general';

export const OPERATION_FAMILY: Record<CliExposedOperationId, OperationFamily> = {
  find: 'query',
  getNode: 'query',
  getNodeById: 'query',
  getText: 'query',
  info: 'general',
  insert: 'textMutation',
  replace: 'textMutation',
  delete: 'textMutation',
  'blocks.delete': 'blocks',
  'format.apply': 'textMutation',
  'format.fontSize': 'textMutation',
  'format.fontFamily': 'textMutation',
  'format.color': 'textMutation',
  'format.align': 'textMutation',
  'create.paragraph': 'create',
  'create.heading': 'create',
  'lists.list': 'lists',
  'lists.get': 'lists',
  'lists.insert': 'lists',
  'lists.setType': 'lists',
  'lists.indent': 'lists',
  'lists.outdent': 'lists',
  'lists.restart': 'lists',
  'lists.exit': 'lists',
  'comments.create': 'comments',
  'comments.patch': 'comments',
  'comments.delete': 'comments',
  'comments.get': 'comments',
  'comments.list': 'comments',
  'trackChanges.list': 'trackChanges',
  'trackChanges.get': 'trackChanges',
  'trackChanges.decide': 'trackChanges',
  'query.match': 'query',
  'mutations.preview': 'general',
  'mutations.apply': 'general',
  'capabilities.get': 'general',
};
