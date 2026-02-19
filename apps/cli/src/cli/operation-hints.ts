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
  info: 'retrieved info',
  insert: 'inserted text',
  replace: 'replaced text',
  delete: 'deleted text',
  'format.bold': 'applied bold',
  'format.italic': 'applied italic',
  'format.underline': 'applied underline',
  'format.strikethrough': 'applied strikethrough',
  'create.paragraph': 'created paragraph',
  'lists.list': 'listed items',
  'lists.get': 'resolved list item',
  'lists.insert': 'inserted list item',
  'lists.setType': 'set list type',
  'lists.indent': 'indented list item',
  'lists.outdent': 'outdented list item',
  'lists.restart': 'restarted list numbering',
  'lists.exit': 'exited list item',
  'comments.add': 'added comment',
  'comments.edit': 'edited comment',
  'comments.reply': 'replied to comment',
  'comments.move': 'moved comment',
  'comments.resolve': 'resolved comment',
  'comments.remove': 'removed comment',
  'comments.setInternal': 'set comment internal flag',
  'comments.setActive': 'set active comment',
  'comments.goTo': 'focused comment',
  'comments.get': 'resolved comment',
  'comments.list': 'listed comments',
  'trackChanges.list': 'listed tracked changes',
  'trackChanges.get': 'resolved tracked change',
  'trackChanges.accept': 'accepted tracked change',
  'trackChanges.reject': 'rejected tracked change',
  'trackChanges.acceptAll': 'accepted all tracked changes',
  'trackChanges.rejectAll': 'rejected all tracked changes',
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
  info: 'documentInfo',
  insert: 'mutationReceipt',
  replace: 'mutationReceipt',
  delete: 'mutationReceipt',
  'format.bold': 'mutationReceipt',
  'format.italic': 'mutationReceipt',
  'format.underline': 'mutationReceipt',
  'format.strikethrough': 'mutationReceipt',
  'create.paragraph': 'createResult',
  'lists.list': 'listResult',
  'lists.get': 'listItemInfo',
  'lists.insert': 'listsMutationResult',
  'lists.setType': 'listsMutationResult',
  'lists.indent': 'listsMutationResult',
  'lists.outdent': 'listsMutationResult',
  'lists.restart': 'listsMutationResult',
  'lists.exit': 'listsMutationResult',
  'comments.add': 'commentReceipt',
  'comments.edit': 'commentReceipt',
  'comments.reply': 'commentReceipt',
  'comments.move': 'commentReceipt',
  'comments.resolve': 'commentReceipt',
  'comments.remove': 'commentReceipt',
  'comments.setInternal': 'commentReceipt',
  'comments.setActive': 'commentReceipt',
  'comments.goTo': 'commentReceipt',
  'comments.get': 'commentInfo',
  'comments.list': 'commentList',
  'trackChanges.list': 'trackChangeList',
  'trackChanges.get': 'trackChangeInfo',
  'trackChanges.accept': 'trackChangeMutationReceipt',
  'trackChanges.reject': 'trackChangeMutationReceipt',
  'trackChanges.acceptAll': 'trackChangeMutationReceipt',
  'trackChanges.rejectAll': 'trackChangeMutationReceipt',
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
  info: null,
  insert: null,
  replace: null,
  delete: null,
  'format.bold': null,
  'format.italic': null,
  'format.underline': null,
  'format.strikethrough': null,
  'create.paragraph': 'result',
  'lists.list': 'result',
  'lists.get': 'item',
  'lists.insert': 'result',
  'lists.setType': 'result',
  'lists.indent': 'result',
  'lists.outdent': 'result',
  'lists.restart': 'result',
  'lists.exit': 'result',
  'comments.add': 'receipt',
  'comments.edit': 'receipt',
  'comments.reply': 'receipt',
  'comments.move': 'receipt',
  'comments.resolve': 'receipt',
  'comments.remove': 'receipt',
  'comments.setInternal': 'receipt',
  'comments.setActive': 'receipt',
  'comments.goTo': 'receipt',
  'comments.get': 'comment',
  'comments.list': 'result',
  'trackChanges.list': 'result',
  'trackChanges.get': 'change',
  'trackChanges.accept': 'receipt',
  'trackChanges.reject': 'receipt',
  'trackChanges.acceptAll': 'receipt',
  'trackChanges.rejectAll': 'receipt',
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
  'format.bold': 'receipt',
  'format.italic': 'receipt',
  'format.underline': 'receipt',
  'format.strikethrough': 'receipt',
};

// ---------------------------------------------------------------------------
// Operation family (determines error-mapping rules)
// ---------------------------------------------------------------------------

/**
 * Operation family — determines which error-mapping rules apply.
 * Explicit Record for compile-time completeness (no string-prefix heuristics).
 */
export type OperationFamily = 'trackChanges' | 'comments' | 'lists' | 'textMutation' | 'create' | 'query' | 'general';

export const OPERATION_FAMILY: Record<CliExposedOperationId, OperationFamily> = {
  find: 'query',
  getNode: 'query',
  getNodeById: 'query',
  info: 'general',
  insert: 'textMutation',
  replace: 'textMutation',
  delete: 'textMutation',
  'format.bold': 'textMutation',
  'format.italic': 'textMutation',
  'format.underline': 'textMutation',
  'format.strikethrough': 'textMutation',
  'create.paragraph': 'create',
  'lists.list': 'lists',
  'lists.get': 'lists',
  'lists.insert': 'lists',
  'lists.setType': 'lists',
  'lists.indent': 'lists',
  'lists.outdent': 'lists',
  'lists.restart': 'lists',
  'lists.exit': 'lists',
  'comments.add': 'comments',
  'comments.edit': 'comments',
  'comments.reply': 'comments',
  'comments.move': 'comments',
  'comments.resolve': 'comments',
  'comments.remove': 'comments',
  'comments.setInternal': 'comments',
  'comments.setActive': 'comments',
  'comments.goTo': 'comments',
  'comments.get': 'comments',
  'comments.list': 'comments',
  'trackChanges.list': 'trackChanges',
  'trackChanges.get': 'trackChanges',
  'trackChanges.accept': 'trackChanges',
  'trackChanges.reject': 'trackChanges',
  'trackChanges.acceptAll': 'trackChanges',
  'trackChanges.rejectAll': 'trackChanges',
};
