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

type FormatOperationId = Extract<CliExposedOperationId, `format.${string}`>;
type FormatInlineAliasOperationId = Exclude<FormatOperationId, 'format.apply' | 'format.align'>;

const FORMAT_INLINE_ALIAS_OPERATION_IDS = (Object.keys(COMMAND_CATALOG) as CliExposedOperationId[]).filter(
  (operationId): operationId is FormatInlineAliasOperationId =>
    operationId.startsWith('format.') && operationId !== 'format.apply' && operationId !== 'format.align',
);

function buildFormatInlineAliasRecord<T>(value: T): Record<FormatInlineAliasOperationId, T> {
  return Object.fromEntries(FORMAT_INLINE_ALIAS_OPERATION_IDS.map((operationId) => [operationId, value])) as Record<
    FormatInlineAliasOperationId,
    T
  >;
}

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
  'format.align': 'set alignment',
  ...buildFormatInlineAliasRecord('applied style'),
  'styles.apply': 'applied stylesheet defaults',
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

  // Tables
  'create.table': 'created table',
  'tables.convertFromText': 'converted text to table',
  'tables.delete': 'deleted table',
  'tables.clearContents': 'cleared table contents',
  'tables.move': 'moved table',
  'tables.split': 'split table',
  'tables.convertToText': 'converted table to text',
  'tables.setLayout': 'updated table layout',
  'tables.insertRow': 'inserted row',
  'tables.deleteRow': 'deleted row',
  'tables.setRowHeight': 'set row height',
  'tables.distributeRows': 'distributed rows',
  'tables.setRowOptions': 'set row options',
  'tables.insertColumn': 'inserted column',
  'tables.deleteColumn': 'deleted column',
  'tables.setColumnWidth': 'set column width',
  'tables.distributeColumns': 'distributed columns',
  'tables.insertCell': 'inserted cell',
  'tables.deleteCell': 'deleted cell',
  'tables.mergeCells': 'merged cells',
  'tables.unmergeCells': 'unmerged cells',
  'tables.splitCell': 'split cell',
  'tables.setCellProperties': 'set cell properties',
  'tables.sort': 'sorted table',
  'tables.setAltText': 'set alt text',
  'tables.setStyle': 'set table style',
  'tables.clearStyle': 'cleared table style',
  'tables.setStyleOption': 'set style option',
  'tables.setBorder': 'set border',
  'tables.clearBorder': 'cleared border',
  'tables.applyBorderPreset': 'applied border preset',
  'tables.setShading': 'set shading',
  'tables.clearShading': 'cleared shading',
  'tables.setTablePadding': 'set table padding',
  'tables.setCellPadding': 'set cell padding',
  'tables.setCellSpacing': 'set cell spacing',
  'tables.clearCellSpacing': 'cleared cell spacing',
  'tables.get': 'resolved table',
  'tables.getCells': 'listed cells',
  'tables.getProperties': 'resolved table properties',
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
  | 'tableMutationResult'
  | 'tableInfo'
  | 'tableCellList'
  | 'tablePropertiesInfo'
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
  'format.align': 'mutationReceipt',
  ...buildFormatInlineAliasRecord('mutationReceipt'),
  'styles.apply': 'receipt',
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

  // Tables
  'create.table': 'createResult',
  'tables.convertFromText': 'tableMutationResult',
  'tables.delete': 'tableMutationResult',
  'tables.clearContents': 'tableMutationResult',
  'tables.move': 'tableMutationResult',
  'tables.split': 'tableMutationResult',
  'tables.convertToText': 'tableMutationResult',
  'tables.setLayout': 'tableMutationResult',
  'tables.insertRow': 'tableMutationResult',
  'tables.deleteRow': 'tableMutationResult',
  'tables.setRowHeight': 'tableMutationResult',
  'tables.distributeRows': 'tableMutationResult',
  'tables.setRowOptions': 'tableMutationResult',
  'tables.insertColumn': 'tableMutationResult',
  'tables.deleteColumn': 'tableMutationResult',
  'tables.setColumnWidth': 'tableMutationResult',
  'tables.distributeColumns': 'tableMutationResult',
  'tables.insertCell': 'tableMutationResult',
  'tables.deleteCell': 'tableMutationResult',
  'tables.mergeCells': 'tableMutationResult',
  'tables.unmergeCells': 'tableMutationResult',
  'tables.splitCell': 'tableMutationResult',
  'tables.setCellProperties': 'tableMutationResult',
  'tables.sort': 'tableMutationResult',
  'tables.setAltText': 'tableMutationResult',
  'tables.setStyle': 'tableMutationResult',
  'tables.clearStyle': 'tableMutationResult',
  'tables.setStyleOption': 'tableMutationResult',
  'tables.setBorder': 'tableMutationResult',
  'tables.clearBorder': 'tableMutationResult',
  'tables.applyBorderPreset': 'tableMutationResult',
  'tables.setShading': 'tableMutationResult',
  'tables.clearShading': 'tableMutationResult',
  'tables.setTablePadding': 'tableMutationResult',
  'tables.setCellPadding': 'tableMutationResult',
  'tables.setCellSpacing': 'tableMutationResult',
  'tables.clearCellSpacing': 'tableMutationResult',
  'tables.get': 'tableInfo',
  'tables.getCells': 'tableCellList',
  'tables.getProperties': 'tablePropertiesInfo',
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
  'format.align': null,
  ...buildFormatInlineAliasRecord(null),
  'styles.apply': 'receipt',
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

  // Tables
  'create.table': 'result',
  'tables.convertFromText': 'result',
  'tables.delete': 'result',
  'tables.clearContents': 'result',
  'tables.move': 'result',
  'tables.split': 'result',
  'tables.convertToText': 'result',
  'tables.setLayout': 'result',
  'tables.insertRow': 'result',
  'tables.deleteRow': 'result',
  'tables.setRowHeight': 'result',
  'tables.distributeRows': 'result',
  'tables.setRowOptions': 'result',
  'tables.insertColumn': 'result',
  'tables.deleteColumn': 'result',
  'tables.setColumnWidth': 'result',
  'tables.distributeColumns': 'result',
  'tables.insertCell': 'result',
  'tables.deleteCell': 'result',
  'tables.mergeCells': 'result',
  'tables.unmergeCells': 'result',
  'tables.splitCell': 'result',
  'tables.setCellProperties': 'result',
  'tables.sort': 'result',
  'tables.setAltText': 'result',
  'tables.setStyle': 'result',
  'tables.clearStyle': 'result',
  'tables.setStyleOption': 'result',
  'tables.setBorder': 'result',
  'tables.clearBorder': 'result',
  'tables.applyBorderPreset': 'result',
  'tables.setShading': 'result',
  'tables.clearShading': 'result',
  'tables.setTablePadding': 'result',
  'tables.setCellPadding': 'result',
  'tables.setCellSpacing': 'result',
  'tables.clearCellSpacing': 'result',
  'tables.get': 'result',
  'tables.getCells': 'result',
  'tables.getProperties': 'result',
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
  'format.align': 'receipt',
  ...buildFormatInlineAliasRecord('receipt'),
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
  | 'tables'
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
  'format.align': 'textMutation',
  ...buildFormatInlineAliasRecord('textMutation'),
  'styles.apply': 'general',
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

  // Tables
  'create.table': 'tables',
  'tables.convertFromText': 'tables',
  'tables.delete': 'tables',
  'tables.clearContents': 'tables',
  'tables.move': 'tables',
  'tables.split': 'tables',
  'tables.convertToText': 'tables',
  'tables.setLayout': 'tables',
  'tables.insertRow': 'tables',
  'tables.deleteRow': 'tables',
  'tables.setRowHeight': 'tables',
  'tables.distributeRows': 'tables',
  'tables.setRowOptions': 'tables',
  'tables.insertColumn': 'tables',
  'tables.deleteColumn': 'tables',
  'tables.setColumnWidth': 'tables',
  'tables.distributeColumns': 'tables',
  'tables.insertCell': 'tables',
  'tables.deleteCell': 'tables',
  'tables.mergeCells': 'tables',
  'tables.unmergeCells': 'tables',
  'tables.splitCell': 'tables',
  'tables.setCellProperties': 'tables',
  'tables.sort': 'tables',
  'tables.setAltText': 'tables',
  'tables.setStyle': 'tables',
  'tables.clearStyle': 'tables',
  'tables.setStyleOption': 'tables',
  'tables.setBorder': 'tables',
  'tables.clearBorder': 'tables',
  'tables.applyBorderPreset': 'tables',
  'tables.setShading': 'tables',
  'tables.clearShading': 'tables',
  'tables.setTablePadding': 'tables',
  'tables.setCellPadding': 'tables',
  'tables.setCellSpacing': 'tables',
  'tables.clearCellSpacing': 'tables',
  'tables.get': 'tables',
  'tables.getCells': 'tables',
  'tables.getProperties': 'tables',
};
