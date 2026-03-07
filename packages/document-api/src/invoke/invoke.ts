/**
 * Runtime dispatch table for the invoke API.
 *
 * Maps every OperationId to a function that delegates to the corresponding
 * direct method on DocumentApi. Built once per createDocumentApi call.
 */

import type { OperationId } from '../contract/types.js';
import type { OperationRegistry } from '../contract/operation-registry.js';
import type { DocumentApi } from '../index.js';
import { INLINE_PROPERTY_REGISTRY } from '../format/inline-run-patch.js';

// ---------------------------------------------------------------------------
// TypedDispatchTable — compile-time contract between registry and dispatch
// ---------------------------------------------------------------------------

type TypedDispatchHandler<K extends OperationId> = OperationRegistry[K]['options'] extends never
  ? (input: OperationRegistry[K]['input']) => OperationRegistry[K]['output']
  : (input: OperationRegistry[K]['input'], options?: OperationRegistry[K]['options']) => OperationRegistry[K]['output'];

export type TypedDispatchTable = {
  [K in OperationId]: TypedDispatchHandler<K>;
};

type FormatInlineAliasOperationId = `format.${(typeof INLINE_PROPERTY_REGISTRY)[number]['key']}`;

function buildFormatInlineAliasDispatch(api: DocumentApi): Pick<TypedDispatchTable, FormatInlineAliasOperationId> {
  return Object.fromEntries(
    INLINE_PROPERTY_REGISTRY.map((entry) => {
      const operationId = `format.${entry.key}` as FormatInlineAliasOperationId;
      return [
        operationId,
        (
          input: OperationRegistry[typeof operationId]['input'],
          options?: OperationRegistry[typeof operationId]['options'],
        ) =>
          (
            api.format[entry.key] as (
              input: OperationRegistry[typeof operationId]['input'],
              options?: OperationRegistry[typeof operationId]['options'],
            ) => OperationRegistry[typeof operationId]['output']
          )(input, options),
      ];
    }),
  ) as Pick<TypedDispatchTable, FormatInlineAliasOperationId>;
}

/**
 * Builds a dispatch table that maps every OperationId to the corresponding
 * direct method call on the given DocumentApi instance.
 *
 * Each entry delegates to the direct method — no parallel execution path.
 * The return type is {@link TypedDispatchTable}, which validates at compile
 * time that each handler conforms to the {@link OperationRegistry} contract.
 */
export function buildDispatchTable(api: DocumentApi): TypedDispatchTable {
  const formatInlineAliasDispatch = buildFormatInlineAliasDispatch(api);

  return {
    // --- Singleton reads ---
    get: (input) => api.get(input),
    find: (input) => api.find(input),
    getNode: (input) => api.getNode(input),
    getNodeById: (input) => api.getNodeById(input),
    getText: (input) => api.getText(input),
    getMarkdown: (input) => api.getMarkdown(input),
    getHtml: (input) => api.getHtml(input),
    markdownToFragment: (input) => api.markdownToFragment(input),
    info: (input) => api.info(input),

    // --- Singleton mutations ---
    clearContent: (input, options) => api.clearContent(input, options),
    insert: (input, options) => api.insert(input, options),
    replace: (input, options) => api.replace(input, options),
    delete: (input, options) => api.delete(input, options),

    // --- blocks.* ---
    'blocks.delete': (input, options) => api.blocks.delete(input, options),

    // --- format.* ---
    'format.apply': (input, options) => api.format.apply(input, options),
    ...formatInlineAliasDispatch,
    // --- styles.paragraph.* ---
    'styles.paragraph.setStyle': (input, options) => api.styles.paragraph.setStyle(input, options),
    'styles.paragraph.clearStyle': (input, options) => api.styles.paragraph.clearStyle(input, options),

    // --- format.paragraph.* ---
    'format.paragraph.resetDirectFormatting': (input, options) =>
      api.format.paragraph.resetDirectFormatting(input, options),
    'format.paragraph.setAlignment': (input, options) => api.format.paragraph.setAlignment(input, options),
    'format.paragraph.clearAlignment': (input, options) => api.format.paragraph.clearAlignment(input, options),
    'format.paragraph.setIndentation': (input, options) => api.format.paragraph.setIndentation(input, options),
    'format.paragraph.clearIndentation': (input, options) => api.format.paragraph.clearIndentation(input, options),
    'format.paragraph.setSpacing': (input, options) => api.format.paragraph.setSpacing(input, options),
    'format.paragraph.clearSpacing': (input, options) => api.format.paragraph.clearSpacing(input, options),
    'format.paragraph.setKeepOptions': (input, options) => api.format.paragraph.setKeepOptions(input, options),
    'format.paragraph.setOutlineLevel': (input, options) => api.format.paragraph.setOutlineLevel(input, options),
    'format.paragraph.setFlowOptions': (input, options) => api.format.paragraph.setFlowOptions(input, options),
    'format.paragraph.setTabStop': (input, options) => api.format.paragraph.setTabStop(input, options),
    'format.paragraph.clearTabStop': (input, options) => api.format.paragraph.clearTabStop(input, options),
    'format.paragraph.clearAllTabStops': (input, options) => api.format.paragraph.clearAllTabStops(input, options),
    'format.paragraph.setBorder': (input, options) => api.format.paragraph.setBorder(input, options),
    'format.paragraph.clearBorder': (input, options) => api.format.paragraph.clearBorder(input, options),
    'format.paragraph.setShading': (input, options) => api.format.paragraph.setShading(input, options),
    'format.paragraph.clearShading': (input, options) => api.format.paragraph.clearShading(input, options),

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
    'lists.create': (input, options) => api.lists.create(input, options),
    'lists.attach': (input, options) => api.lists.attach(input, options),
    'lists.detach': (input, options) => api.lists.detach(input, options),
    'lists.indent': (input, options) => api.lists.indent(input, options),
    'lists.outdent': (input, options) => api.lists.outdent(input, options),
    'lists.join': (input, options) => api.lists.join(input, options),
    'lists.canJoin': (input) => api.lists.canJoin(input),
    'lists.separate': (input, options) => api.lists.separate(input, options),
    'lists.setLevel': (input, options) => api.lists.setLevel(input, options),
    'lists.setValue': (input, options) => api.lists.setValue(input, options),
    'lists.continuePrevious': (input, options) => api.lists.continuePrevious(input, options),
    'lists.canContinuePrevious': (input) => api.lists.canContinuePrevious(input),
    'lists.setLevelRestart': (input, options) => api.lists.setLevelRestart(input, options),
    'lists.convertToText': (input, options) => api.lists.convertToText(input, options),

    // --- lists.* (SD-1973 formatting) ---
    'lists.applyTemplate': (input, options) => api.lists.applyTemplate(input, options),
    'lists.applyPreset': (input, options) => api.lists.applyPreset(input, options),
    'lists.setType': (input, options) => api.lists.setType(input, options),
    'lists.captureTemplate': (input) => api.lists.captureTemplate(input),
    'lists.setLevelNumbering': (input, options) => api.lists.setLevelNumbering(input, options),
    'lists.setLevelBullet': (input, options) => api.lists.setLevelBullet(input, options),
    'lists.setLevelPictureBullet': (input, options) => api.lists.setLevelPictureBullet(input, options),
    'lists.setLevelAlignment': (input, options) => api.lists.setLevelAlignment(input, options),
    'lists.setLevelIndents': (input, options) => api.lists.setLevelIndents(input, options),
    'lists.setLevelTrailingCharacter': (input, options) => api.lists.setLevelTrailingCharacter(input, options),
    'lists.setLevelMarkerFont': (input, options) => api.lists.setLevelMarkerFont(input, options),
    'lists.clearLevelOverrides': (input, options) => api.lists.clearLevelOverrides(input, options),

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

    // --- history.* ---
    'history.get': () => api.history.get(),
    'history.undo': () => api.history.undo(),
    'history.redo': () => api.history.redo(),

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
    'tables.getStyles': (input) => api.tables.getStyles(input),
    'tables.setDefaultStyle': (input, options) => api.tables.setDefaultStyle(input, options),
    'tables.clearDefaultStyle': (input, options) => api.tables.clearDefaultStyle(input, options),

    // --- create.tableOfContents ---
    'create.tableOfContents': (input, options) => api.create.tableOfContents(input, options),

    // --- toc.* ---
    'toc.list': (input) => api.toc.list(input),
    'toc.get': (input) => api.toc.get(input),
    'toc.configure': (input, options) => api.toc.configure(input, options),
    'toc.update': (input, options) => api.toc.update(input, options),
    'toc.remove': (input, options) => api.toc.remove(input, options),

    // --- toc entry (TC field) operations ---
    'toc.markEntry': (input, options) => api.toc.markEntry(input, options),
    'toc.unmarkEntry': (input, options) => api.toc.unmarkEntry(input, options),
    'toc.listEntries': (input) => api.toc.listEntries(input),
    'toc.getEntry': (input) => api.toc.getEntry(input),
    'toc.editEntry': (input, options) => api.toc.editEntry(input, options),

    // --- create.image ---
    'create.image': (input, options) => api.create.image(input, options),

    // --- images.* ---
    'images.list': (input) => api.images.list(input ?? {}),
    'images.get': (input) => api.images.get(input),
    'images.delete': (input, options) => api.images.delete(input, options),
    'images.move': (input, options) => api.images.move(input, options),
    'images.convertToInline': (input, options) => api.images.convertToInline(input, options),
    'images.convertToFloating': (input, options) => api.images.convertToFloating(input, options),
    'images.setSize': (input, options) => api.images.setSize(input, options),
    'images.setWrapType': (input, options) => api.images.setWrapType(input, options),
    'images.setWrapSide': (input, options) => api.images.setWrapSide(input, options),
    'images.setWrapDistances': (input, options) => api.images.setWrapDistances(input, options),
    'images.setPosition': (input, options) => api.images.setPosition(input, options),
    'images.setAnchorOptions': (input, options) => api.images.setAnchorOptions(input, options),
    'images.setZOrder': (input, options) => api.images.setZOrder(input, options),
    // SD-2100: Geometry
    'images.scale': (input, options) => api.images.scale(input, options),
    'images.setLockAspectRatio': (input, options) => api.images.setLockAspectRatio(input, options),
    'images.rotate': (input, options) => api.images.rotate(input, options),
    'images.flip': (input, options) => api.images.flip(input, options),
    'images.crop': (input, options) => api.images.crop(input, options),
    'images.resetCrop': (input, options) => api.images.resetCrop(input, options),
    // SD-2100: Content
    'images.replaceSource': (input, options) => api.images.replaceSource(input, options),
    // SD-2100: Semantic metadata
    'images.setAltText': (input, options) => api.images.setAltText(input, options),
    'images.setDecorative': (input, options) => api.images.setDecorative(input, options),
    'images.setName': (input, options) => api.images.setName(input, options),
    'images.setHyperlink': (input, options) => api.images.setHyperlink(input, options),
    // SD-2100: Caption lifecycle
    'images.insertCaption': (input, options) => api.images.insertCaption(input, options),
    'images.updateCaption': (input, options) => api.images.updateCaption(input, options),
    'images.removeCaption': (input, options) => api.images.removeCaption(input, options),

    // --- hyperlinks.* ---
    'hyperlinks.list': (input) => api.hyperlinks.list(input),
    'hyperlinks.get': (input) => api.hyperlinks.get(input),
    'hyperlinks.wrap': (input, options) => api.hyperlinks.wrap(input, options),
    'hyperlinks.insert': (input, options) => api.hyperlinks.insert(input, options),
    'hyperlinks.patch': (input, options) => api.hyperlinks.patch(input, options),
    'hyperlinks.remove': (input, options) => api.hyperlinks.remove(input, options),

    // --- create.contentControl ---
    'create.contentControl': (input, options) => api.create.contentControl(input, options),

    // --- contentControls.* core CRUD + discovery ---
    'contentControls.list': (input) => api.contentControls.list(input),
    'contentControls.get': (input) => api.contentControls.get(input),
    'contentControls.listInRange': (input) => api.contentControls.listInRange(input),
    'contentControls.selectByTag': (input) => api.contentControls.selectByTag(input),
    'contentControls.selectByTitle': (input) => api.contentControls.selectByTitle(input),
    'contentControls.listChildren': (input) => api.contentControls.listChildren(input),
    'contentControls.getParent': (input) => api.contentControls.getParent(input),
    'contentControls.wrap': (input, options) => api.contentControls.wrap(input, options),
    'contentControls.unwrap': (input, options) => api.contentControls.unwrap(input, options),
    'contentControls.delete': (input, options) => api.contentControls.delete(input, options),
    'contentControls.copy': (input, options) => api.contentControls.copy(input, options),
    'contentControls.move': (input, options) => api.contentControls.move(input, options),
    'contentControls.patch': (input, options) => api.contentControls.patch(input, options),
    'contentControls.setLockMode': (input, options) => api.contentControls.setLockMode(input, options),
    'contentControls.setType': (input, options) => api.contentControls.setType(input, options),
    'contentControls.getContent': (input) => api.contentControls.getContent(input),
    'contentControls.replaceContent': (input, options) => api.contentControls.replaceContent(input, options),
    'contentControls.clearContent': (input, options) => api.contentControls.clearContent(input, options),
    'contentControls.appendContent': (input, options) => api.contentControls.appendContent(input, options),
    'contentControls.prependContent': (input, options) => api.contentControls.prependContent(input, options),
    'contentControls.insertBefore': (input, options) => api.contentControls.insertBefore(input, options),
    'contentControls.insertAfter': (input, options) => api.contentControls.insertAfter(input, options),

    // --- contentControls.* data binding + raw ---
    'contentControls.getBinding': (input) => api.contentControls.getBinding(input),
    'contentControls.setBinding': (input, options) => api.contentControls.setBinding(input, options),
    'contentControls.clearBinding': (input, options) => api.contentControls.clearBinding(input, options),
    'contentControls.getRawProperties': (input) => api.contentControls.getRawProperties(input),
    'contentControls.patchRawProperties': (input, options) => api.contentControls.patchRawProperties(input, options),
    'contentControls.validateWordCompatibility': (input) => api.contentControls.validateWordCompatibility(input),
    'contentControls.normalizeWordCompatibility': (input, options) =>
      api.contentControls.normalizeWordCompatibility(input, options),
    'contentControls.normalizeTagPayload': (input, options) => api.contentControls.normalizeTagPayload(input, options),

    // --- contentControls.text.* ---
    'contentControls.text.setMultiline': (input, options) => api.contentControls.text.setMultiline(input, options),
    'contentControls.text.setValue': (input, options) => api.contentControls.text.setValue(input, options),
    'contentControls.text.clearValue': (input, options) => api.contentControls.text.clearValue(input, options),

    // --- contentControls.date.* ---
    'contentControls.date.setValue': (input, options) => api.contentControls.date.setValue(input, options),
    'contentControls.date.clearValue': (input, options) => api.contentControls.date.clearValue(input, options),
    'contentControls.date.setDisplayFormat': (input, options) =>
      api.contentControls.date.setDisplayFormat(input, options),
    'contentControls.date.setDisplayLocale': (input, options) =>
      api.contentControls.date.setDisplayLocale(input, options),
    'contentControls.date.setStorageFormat': (input, options) =>
      api.contentControls.date.setStorageFormat(input, options),
    'contentControls.date.setCalendar': (input, options) => api.contentControls.date.setCalendar(input, options),

    // --- contentControls.checkbox.* ---
    'contentControls.checkbox.getState': (input) => api.contentControls.checkbox.getState(input),
    'contentControls.checkbox.setState': (input, options) => api.contentControls.checkbox.setState(input, options),
    'contentControls.checkbox.toggle': (input, options) => api.contentControls.checkbox.toggle(input, options),
    'contentControls.checkbox.setSymbolPair': (input, options) =>
      api.contentControls.checkbox.setSymbolPair(input, options),

    // --- contentControls.choiceList.* ---
    'contentControls.choiceList.getItems': (input) => api.contentControls.choiceList.getItems(input),
    'contentControls.choiceList.setItems': (input, options) => api.contentControls.choiceList.setItems(input, options),
    'contentControls.choiceList.setSelected': (input, options) =>
      api.contentControls.choiceList.setSelected(input, options),

    // --- contentControls.repeatingSection.* ---
    'contentControls.repeatingSection.listItems': (input) => api.contentControls.repeatingSection.listItems(input),
    'contentControls.repeatingSection.insertItemBefore': (input, options) =>
      api.contentControls.repeatingSection.insertItemBefore(input, options),
    'contentControls.repeatingSection.insertItemAfter': (input, options) =>
      api.contentControls.repeatingSection.insertItemAfter(input, options),
    'contentControls.repeatingSection.cloneItem': (input, options) =>
      api.contentControls.repeatingSection.cloneItem(input, options),
    'contentControls.repeatingSection.deleteItem': (input, options) =>
      api.contentControls.repeatingSection.deleteItem(input, options),
    'contentControls.repeatingSection.setAllowInsertDelete': (input, options) =>
      api.contentControls.repeatingSection.setAllowInsertDelete(input, options),

    // --- contentControls.group.* ---
    'contentControls.group.wrap': (input, options) => api.contentControls.group.wrap(input, options),
    'contentControls.group.ungroup': (input, options) => api.contentControls.group.ungroup(input, options),
  };
}
