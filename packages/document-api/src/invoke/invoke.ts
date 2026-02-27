/**
 * Runtime dispatch table for the invoke API.
 *
 * Maps every OperationId to a function that delegates to the corresponding
 * direct method on DocumentApi. Built once per createDocumentApi call.
 */

import type { OperationId } from '../contract/types.js';
import type { OperationRegistry } from '../contract/operation-registry.js';
import type { DocumentApi } from '../index.js';

// ---------------------------------------------------------------------------
// TypedDispatchTable — compile-time contract between registry and dispatch
// ---------------------------------------------------------------------------

type TypedDispatchHandler<K extends OperationId> = OperationRegistry[K]['options'] extends never
  ? (input: OperationRegistry[K]['input']) => OperationRegistry[K]['output']
  : (input: OperationRegistry[K]['input'], options?: OperationRegistry[K]['options']) => OperationRegistry[K]['output'];

export type TypedDispatchTable = {
  [K in OperationId]: TypedDispatchHandler<K>;
};

/**
 * Builds a dispatch table that maps every OperationId to the corresponding
 * direct method call on the given DocumentApi instance.
 *
 * Each entry delegates to the direct method — no parallel execution path.
 * The return type is {@link TypedDispatchTable}, which validates at compile
 * time that each handler conforms to the {@link OperationRegistry} contract.
 */
export function buildDispatchTable(api: DocumentApi): TypedDispatchTable {
  return {
    // --- Singleton reads ---
    find: (input, options) =>
      api.find(input as Parameters<typeof api.find>[0], options as Parameters<typeof api.find>[1]),
    getNode: (input) => api.getNode(input),
    getNodeById: (input) => api.getNodeById(input),
    getText: (input) => api.getText(input),
    info: (input) => api.info(input),

    // --- Singleton mutations ---
    insert: (input, options) => api.insert(input, options),
    replace: (input, options) => api.replace(input, options),
    delete: (input, options) => api.delete(input, options),

    // --- blocks.* ---
    'blocks.delete': (input, options) => api.blocks.delete(input, options),

    // --- format.* ---
    'format.apply': (input, options) => api.format.apply(input, options),
    'format.fontSize': (input, options) => api.format.fontSize(input, options),
    'format.fontFamily': (input, options) => api.format.fontFamily(input, options),
    'format.color': (input, options) => api.format.color(input, options),
    'format.align': (input, options) => api.format.align(input, options),

    // --- styles.* ---
    'styles.apply': (input, options) => api.styles.apply(input, options),

    // --- create.* ---
    'create.paragraph': (input, options) => api.create.paragraph(input, options),
    'create.heading': (input, options) => api.create.heading(input, options),
    'create.sectionBreak': (input, options) => api.create.sectionBreak(input, options),

    // --- lists.* ---
    'lists.list': (input) => api.lists.list(input),
    'lists.get': (input) => api.lists.get(input),
    'lists.insert': (input, options) => api.lists.insert(input, options),
    'lists.setType': (input, options) => api.lists.setType(input, options),
    'lists.indent': (input, options) => api.lists.indent(input, options),
    'lists.outdent': (input, options) => api.lists.outdent(input, options),
    'lists.restart': (input, options) => api.lists.restart(input, options),
    'lists.exit': (input, options) => api.lists.exit(input, options),

    // --- sections.* ---
    'sections.list': (input) => api.sections.list(input),
    'sections.get': (input) => api.sections.get(input),
    'sections.setBreakType': (input, options) => api.sections.setBreakType(input, options),
    'sections.setPageMargins': (input, options) => api.sections.setPageMargins(input, options),
    'sections.setHeaderFooterMargins': (input, options) => api.sections.setHeaderFooterMargins(input, options),
    'sections.setPageSetup': (input, options) => api.sections.setPageSetup(input, options),
    'sections.setColumns': (input, options) => api.sections.setColumns(input, options),
    'sections.setLineNumbering': (input, options) => api.sections.setLineNumbering(input, options),
    'sections.setPageNumbering': (input, options) => api.sections.setPageNumbering(input, options),
    'sections.setTitlePage': (input, options) => api.sections.setTitlePage(input, options),
    'sections.setOddEvenHeadersFooters': (input, options) => api.sections.setOddEvenHeadersFooters(input, options),
    'sections.setVerticalAlign': (input, options) => api.sections.setVerticalAlign(input, options),
    'sections.setSectionDirection': (input, options) => api.sections.setSectionDirection(input, options),
    'sections.setHeaderFooterRef': (input, options) => api.sections.setHeaderFooterRef(input, options),
    'sections.clearHeaderFooterRef': (input, options) => api.sections.clearHeaderFooterRef(input, options),
    'sections.setLinkToPrevious': (input, options) => api.sections.setLinkToPrevious(input, options),
    'sections.setPageBorders': (input, options) => api.sections.setPageBorders(input, options),
    'sections.clearPageBorders': (input, options) => api.sections.clearPageBorders(input, options),

    // --- comments.* ---
    'comments.create': (input, options) => api.comments.create(input, options),
    'comments.patch': (input, options) => api.comments.patch(input, options),
    'comments.delete': (input, options) => api.comments.delete(input, options),
    'comments.get': (input) => api.comments.get(input),
    'comments.list': (input) => api.comments.list(input),

    // --- trackChanges.* ---
    'trackChanges.list': (input) => api.trackChanges.list(input),
    'trackChanges.get': (input) => api.trackChanges.get(input),
    'trackChanges.decide': (input, options) => api.trackChanges.decide(input, options),

    // --- query.* ---
    'query.match': (input) => api.query.match(input),

    // --- mutations.* ---
    'mutations.preview': (input) => api.mutations.preview(input),
    'mutations.apply': (input) => api.mutations.apply(input),

    // --- capabilities ---
    'capabilities.get': () => api.capabilities(),

    // --- create.table ---
    'create.table': (input, options) => api.create.table(input, options),

    // --- tables.* ---
    'tables.convertFromText': (input, options) => api.tables.convertFromText(input, options),
    'tables.delete': (input, options) => api.tables.delete(input, options),
    'tables.clearContents': (input, options) => api.tables.clearContents(input, options),
    'tables.move': (input, options) => api.tables.move(input, options),
    'tables.split': (input, options) => api.tables.split(input, options),
    'tables.convertToText': (input, options) => api.tables.convertToText(input, options),
    'tables.setLayout': (input, options) => api.tables.setLayout(input, options),
    'tables.insertRow': (input, options) => api.tables.insertRow(input, options),
    'tables.deleteRow': (input, options) => api.tables.deleteRow(input, options),
    'tables.setRowHeight': (input, options) => api.tables.setRowHeight(input, options),
    'tables.distributeRows': (input, options) => api.tables.distributeRows(input, options),
    'tables.setRowOptions': (input, options) => api.tables.setRowOptions(input, options),
    'tables.insertColumn': (input, options) => api.tables.insertColumn(input, options),
    'tables.deleteColumn': (input, options) => api.tables.deleteColumn(input, options),
    'tables.setColumnWidth': (input, options) => api.tables.setColumnWidth(input, options),
    'tables.distributeColumns': (input, options) => api.tables.distributeColumns(input, options),
    'tables.insertCell': (input, options) => api.tables.insertCell(input, options),
    'tables.deleteCell': (input, options) => api.tables.deleteCell(input, options),
    'tables.mergeCells': (input, options) => api.tables.mergeCells(input, options),
    'tables.unmergeCells': (input, options) => api.tables.unmergeCells(input, options),
    'tables.splitCell': (input, options) => api.tables.splitCell(input, options),
    'tables.setCellProperties': (input, options) => api.tables.setCellProperties(input, options),
    'tables.sort': (input, options) => api.tables.sort(input, options),
    'tables.setAltText': (input, options) => api.tables.setAltText(input, options),
    'tables.setStyle': (input, options) => api.tables.setStyle(input, options),
    'tables.clearStyle': (input, options) => api.tables.clearStyle(input, options),
    'tables.setStyleOption': (input, options) => api.tables.setStyleOption(input, options),
    'tables.setBorder': (input, options) => api.tables.setBorder(input, options),
    'tables.clearBorder': (input, options) => api.tables.clearBorder(input, options),
    'tables.applyBorderPreset': (input, options) => api.tables.applyBorderPreset(input, options),
    'tables.setShading': (input, options) => api.tables.setShading(input, options),
    'tables.clearShading': (input, options) => api.tables.clearShading(input, options),
    'tables.setTablePadding': (input, options) => api.tables.setTablePadding(input, options),
    'tables.setCellPadding': (input, options) => api.tables.setCellPadding(input, options),
    'tables.setCellSpacing': (input, options) => api.tables.setCellSpacing(input, options),
    'tables.clearCellSpacing': (input, options) => api.tables.clearCellSpacing(input, options),

    // --- tables.* reads ---
    'tables.get': (input) => api.tables.get(input),
    'tables.getCells': (input) => api.tables.getCells(input),
    'tables.getProperties': (input) => api.tables.getProperties(input),
  };
}
