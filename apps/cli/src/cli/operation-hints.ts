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

import { COMMAND_CATALOG, INLINE_PROPERTY_REGISTRY, type InlineRunPatchKey } from '@superdoc/document-api';
import type { CliExposedOperationId } from './operation-set.js';

type FormatInlineAliasOperationId = `format.${InlineRunPatchKey}`;

const FORMAT_INLINE_ALIAS_OPERATION_IDS = INLINE_PROPERTY_REGISTRY.map(
  (entry) => `format.${entry.key}` as FormatInlineAliasOperationId,
);

function buildFormatInlineAliasRecord<T>(value: T): Record<FormatInlineAliasOperationId, T> {
  return Object.fromEntries(FORMAT_INLINE_ALIAS_OPERATION_IDS.map((operationId) => [operationId, value])) as Record<
    FormatInlineAliasOperationId,
    T
  >;
}

const PARAGRAPH_OPERATION_IDS = [
  'styles.paragraph.setStyle',
  'styles.paragraph.clearStyle',
  'format.paragraph.resetDirectFormatting',
  'format.paragraph.setAlignment',
  'format.paragraph.clearAlignment',
  'format.paragraph.setIndentation',
  'format.paragraph.clearIndentation',
  'format.paragraph.setSpacing',
  'format.paragraph.clearSpacing',
  'format.paragraph.setKeepOptions',
  'format.paragraph.setOutlineLevel',
  'format.paragraph.setFlowOptions',
  'format.paragraph.setTabStop',
  'format.paragraph.clearTabStop',
  'format.paragraph.clearAllTabStops',
  'format.paragraph.setBorder',
  'format.paragraph.clearBorder',
  'format.paragraph.setShading',
  'format.paragraph.clearShading',
] as const satisfies readonly CliExposedOperationId[];

type ParagraphOperationId = (typeof PARAGRAPH_OPERATION_IDS)[number];

function buildParagraphRecord<T>(value: T): Record<ParagraphOperationId, T> {
  return Object.fromEntries(PARAGRAPH_OPERATION_IDS.map((operationId) => [operationId, value])) as Record<
    ParagraphOperationId,
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
  getMarkdown: 'extracted markdown',
  getHtml: 'extracted html',
  info: 'retrieved info',
  clearContent: 'cleared document content',
  insert: 'inserted text',
  replace: 'replaced text',
  delete: 'deleted text',
  'blocks.delete': 'deleted block',
  'format.apply': 'applied style',
  ...buildFormatInlineAliasRecord('applied style'),
  ...buildParagraphRecord('updated paragraph formatting'),
  'styles.apply': 'applied stylesheet defaults',
  'create.paragraph': 'created paragraph',
  'create.heading': 'created heading',
  'create.tableOfContents': 'created table of contents',
  'lists.list': 'listed items',
  'lists.get': 'resolved list item',
  'lists.insert': 'inserted list item',
  'lists.indent': 'indented list item',
  'lists.outdent': 'outdented list item',
  'lists.create': 'created list',
  'lists.attach': 'attached to list',
  'lists.detach': 'detached from list',
  'lists.join': 'joined lists',
  'lists.canJoin': 'checked join feasibility',
  'lists.separate': 'separated list',
  'lists.setLevel': 'set list level',
  'lists.setValue': 'set list value',
  'lists.continuePrevious': 'continued previous list',
  'lists.canContinuePrevious': 'checked continue feasibility',
  'lists.setLevelRestart': 'set level restart',
  'lists.applyTemplate': 'applied list template',
  'lists.applyPreset': 'applied list preset',
  'lists.captureTemplate': 'captured list template',
  'lists.setLevelNumbering': 'set level numbering',
  'lists.setLevelBullet': 'set level bullet',
  'lists.setLevelPictureBullet': 'set level picture bullet',
  'lists.setLevelAlignment': 'set level alignment',
  'lists.setLevelIndents': 'set level indents',
  'lists.setLevelTrailingCharacter': 'set level trailing character',
  'lists.setLevelMarkerFont': 'set level marker font',
  'lists.clearLevelOverrides': 'cleared level overrides',
  'lists.convertToText': 'converted list to text',
  'comments.create': 'created comment',
  'comments.patch': 'patched comment',
  'comments.delete': 'deleted comment',
  'comments.get': 'resolved comment',
  'comments.list': 'listed comments',
  'trackChanges.list': 'listed tracked changes',
  'trackChanges.get': 'resolved tracked change',
  'trackChanges.decide': 'reviewed tracked change',
  'toc.list': 'listed tables of contents',
  'toc.get': 'resolved table of contents',
  'toc.configure': 'configured table of contents',
  'toc.update': 'updated table of contents',
  'toc.remove': 'removed table of contents',
  'toc.markEntry': 'marked table of contents entry',
  'toc.unmarkEntry': 'unmarked table of contents entry',
  'toc.listEntries': 'listed table of contents entries',
  'toc.getEntry': 'resolved table of contents entry',
  'toc.editEntry': 'edited table of contents entry',
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
  'tables.getStyles': 'listed table styles',
  'tables.setDefaultStyle': 'set default table style',
  'tables.clearDefaultStyle': 'cleared default table style',
  'history.get': 'retrieved history state',
  'history.undo': 'undid last change',
  'history.redo': 'redid last change',

  // Images
  'create.image': 'created image',
  'images.list': 'listed images',
  'images.get': 'resolved image',
  'images.delete': 'deleted image',
  'images.move': 'moved image',
  'images.convertToInline': 'converted to inline',
  'images.convertToFloating': 'converted to floating',
  'images.setSize': 'set image size',
  'images.setWrapType': 'set wrap type',
  'images.setWrapSide': 'set wrap side',
  'images.setWrapDistances': 'set wrap distances',
  'images.setPosition': 'set position',
  'images.setAnchorOptions': 'set anchor options',
  'images.setZOrder': 'set z-order',
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
  getMarkdown: 'plain',
  getHtml: 'plain',
  info: 'documentInfo',
  clearContent: 'receipt',
  insert: 'mutationReceipt',
  replace: 'mutationReceipt',
  delete: 'mutationReceipt',
  'blocks.delete': 'plain',
  'format.apply': 'mutationReceipt',
  ...buildFormatInlineAliasRecord('mutationReceipt'),
  ...buildParagraphRecord('plain'),
  'styles.apply': 'receipt',
  'create.paragraph': 'createResult',
  'create.heading': 'createResult',
  'create.tableOfContents': 'createResult',
  'lists.list': 'listResult',
  'lists.get': 'listItemInfo',
  'lists.insert': 'listsMutationResult',
  'lists.indent': 'listsMutationResult',
  'lists.outdent': 'listsMutationResult',
  'lists.create': 'listsMutationResult',
  'lists.attach': 'listsMutationResult',
  'lists.detach': 'listsMutationResult',
  'lists.join': 'listsMutationResult',
  'lists.canJoin': 'plain',
  'lists.separate': 'listsMutationResult',
  'lists.setLevel': 'listsMutationResult',
  'lists.setValue': 'listsMutationResult',
  'lists.continuePrevious': 'listsMutationResult',
  'lists.canContinuePrevious': 'plain',
  'lists.setLevelRestart': 'listsMutationResult',
  'lists.applyTemplate': 'listsMutationResult',
  'lists.applyPreset': 'listsMutationResult',
  'lists.captureTemplate': 'plain',
  'lists.setLevelNumbering': 'listsMutationResult',
  'lists.setLevelBullet': 'listsMutationResult',
  'lists.setLevelPictureBullet': 'listsMutationResult',
  'lists.setLevelAlignment': 'listsMutationResult',
  'lists.setLevelIndents': 'listsMutationResult',
  'lists.setLevelTrailingCharacter': 'listsMutationResult',
  'lists.setLevelMarkerFont': 'listsMutationResult',
  'lists.clearLevelOverrides': 'listsMutationResult',
  'lists.convertToText': 'listsMutationResult',
  'comments.create': 'commentReceipt',
  'comments.patch': 'commentReceipt',
  'comments.delete': 'commentReceipt',
  'comments.get': 'commentInfo',
  'comments.list': 'commentList',
  'trackChanges.list': 'trackChangeList',
  'trackChanges.get': 'trackChangeInfo',
  'trackChanges.decide': 'trackChangeMutationReceipt',
  'toc.list': 'plain',
  'toc.get': 'plain',
  'toc.configure': 'plain',
  'toc.update': 'plain',
  'toc.remove': 'plain',
  'toc.markEntry': 'plain',
  'toc.unmarkEntry': 'plain',
  'toc.listEntries': 'plain',
  'toc.getEntry': 'plain',
  'toc.editEntry': 'plain',
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
  'tables.getStyles': 'plain',
  'tables.setDefaultStyle': 'plain',
  'tables.clearDefaultStyle': 'plain',
  'history.get': 'plain',
  'history.undo': 'plain',
  'history.redo': 'plain',

  // Images
  'create.image': 'createResult',
  'images.list': 'plain',
  'images.get': 'plain',
  'images.delete': 'plain',
  'images.move': 'plain',
  'images.convertToInline': 'plain',
  'images.convertToFloating': 'plain',
  'images.setSize': 'plain',
  'images.setWrapType': 'plain',
  'images.setWrapSide': 'plain',
  'images.setWrapDistances': 'plain',
  'images.setPosition': 'plain',
  'images.setAnchorOptions': 'plain',
  'images.setZOrder': 'plain',
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
  getMarkdown: 'markdown',
  getHtml: 'html',
  info: null,
  clearContent: 'receipt',
  insert: null,
  replace: null,
  delete: null,
  'blocks.delete': 'result',
  'format.apply': null,
  ...buildFormatInlineAliasRecord(null),
  ...buildParagraphRecord('result'),
  'styles.apply': 'receipt',
  'create.paragraph': 'result',
  'create.heading': 'result',
  'create.tableOfContents': 'result',
  'lists.list': 'result',
  'lists.get': 'item',
  'lists.insert': 'result',
  'lists.indent': 'result',
  'lists.outdent': 'result',
  'lists.create': 'result',
  'lists.attach': 'result',
  'lists.detach': 'result',
  'lists.join': 'result',
  'lists.canJoin': 'result',
  'lists.separate': 'result',
  'lists.setLevel': 'result',
  'lists.setValue': 'result',
  'lists.continuePrevious': 'result',
  'lists.canContinuePrevious': 'result',
  'lists.setLevelRestart': 'result',
  'lists.applyTemplate': 'result',
  'lists.applyPreset': 'result',
  'lists.captureTemplate': 'result',
  'lists.setLevelNumbering': 'result',
  'lists.setLevelBullet': 'result',
  'lists.setLevelPictureBullet': 'result',
  'lists.setLevelAlignment': 'result',
  'lists.setLevelIndents': 'result',
  'lists.setLevelTrailingCharacter': 'result',
  'lists.setLevelMarkerFont': 'result',
  'lists.clearLevelOverrides': 'result',
  'lists.convertToText': 'result',
  'comments.create': 'receipt',
  'comments.patch': 'receipt',
  'comments.delete': 'receipt',
  'comments.get': 'comment',
  'comments.list': 'result',
  'trackChanges.list': 'result',
  'trackChanges.get': 'change',
  'trackChanges.decide': 'receipt',
  'toc.list': 'result',
  'toc.get': 'result',
  'toc.configure': 'result',
  'toc.update': 'result',
  'toc.remove': 'result',
  'toc.markEntry': 'result',
  'toc.unmarkEntry': 'result',
  'toc.listEntries': 'result',
  'toc.getEntry': 'result',
  'toc.editEntry': 'result',
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
  'tables.getStyles': 'result',
  'tables.setDefaultStyle': 'result',
  'tables.clearDefaultStyle': 'result',
  'history.get': 'result',
  'history.undo': 'result',
  'history.redo': 'result',

  // Images
  'create.image': 'result',
  'images.list': 'result',
  'images.get': 'result',
  'images.delete': 'result',
  'images.move': 'result',
  'images.convertToInline': 'result',
  'images.convertToFloating': 'result',
  'images.setSize': 'result',
  'images.setWrapType': 'result',
  'images.setWrapSide': 'result',
  'images.setWrapDistances': 'result',
  'images.setPosition': 'result',
  'images.setAnchorOptions': 'result',
  'images.setZOrder': 'result',
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
  | 'images'
  | 'toc'
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
  getMarkdown: 'query',
  getHtml: 'query',
  info: 'general',
  clearContent: 'general',
  insert: 'textMutation',
  replace: 'textMutation',
  delete: 'textMutation',
  'blocks.delete': 'blocks',
  'format.apply': 'textMutation',
  ...buildFormatInlineAliasRecord('textMutation'),
  ...buildParagraphRecord('textMutation'),
  'styles.apply': 'general',
  'create.paragraph': 'create',
  'create.heading': 'create',
  'create.tableOfContents': 'create',
  'lists.list': 'lists',
  'lists.get': 'lists',
  'lists.insert': 'lists',
  'lists.indent': 'lists',
  'lists.outdent': 'lists',
  'lists.create': 'lists',
  'lists.attach': 'lists',
  'lists.detach': 'lists',
  'lists.join': 'lists',
  'lists.canJoin': 'lists',
  'lists.separate': 'lists',
  'lists.setLevel': 'lists',
  'lists.setValue': 'lists',
  'lists.continuePrevious': 'lists',
  'lists.canContinuePrevious': 'lists',
  'lists.setLevelRestart': 'lists',
  'lists.applyTemplate': 'lists',
  'lists.applyPreset': 'lists',
  'lists.captureTemplate': 'lists',
  'lists.setLevelNumbering': 'lists',
  'lists.setLevelBullet': 'lists',
  'lists.setLevelPictureBullet': 'lists',
  'lists.setLevelAlignment': 'lists',
  'lists.setLevelIndents': 'lists',
  'lists.setLevelTrailingCharacter': 'lists',
  'lists.setLevelMarkerFont': 'lists',
  'lists.clearLevelOverrides': 'lists',
  'lists.convertToText': 'lists',
  'comments.create': 'comments',
  'comments.patch': 'comments',
  'comments.delete': 'comments',
  'comments.get': 'comments',
  'comments.list': 'comments',
  'trackChanges.list': 'trackChanges',
  'trackChanges.get': 'trackChanges',
  'trackChanges.decide': 'trackChanges',
  'toc.list': 'query',
  'toc.get': 'query',
  'toc.configure': 'toc',
  'toc.update': 'toc',
  'toc.remove': 'toc',
  'toc.markEntry': 'toc',
  'toc.unmarkEntry': 'toc',
  'toc.listEntries': 'query',
  'toc.getEntry': 'query',
  'toc.editEntry': 'toc',
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
  'tables.getStyles': 'tables',
  'tables.setDefaultStyle': 'tables',
  'tables.clearDefaultStyle': 'tables',
  'history.get': 'query',
  'history.undo': 'general',
  'history.redo': 'general',

  // Images
  'create.image': 'images',
  'images.list': 'images',
  'images.get': 'images',
  'images.delete': 'images',
  'images.move': 'images',
  'images.convertToInline': 'images',
  'images.convertToFloating': 'images',
  'images.setSize': 'images',
  'images.setWrapType': 'images',
  'images.setWrapSide': 'images',
  'images.setWrapDistances': 'images',
  'images.setPosition': 'images',
  'images.setAnchorOptions': 'images',
  'images.setZOrder': 'images',
};
