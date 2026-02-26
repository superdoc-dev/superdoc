import type { DocumentApiAdapters } from '@superdoc/document-api';
import type { Editor } from '../core/Editor.js';
import { findAdapter } from './find-adapter.js';
import { getNodeAdapter, getNodeByIdAdapter } from './get-node-adapter.js';
import { getTextAdapter } from './get-text-adapter.js';
import { infoAdapter } from './info-adapter.js';
import { getDocumentApiCapabilities } from './capabilities-adapter.js';
import { createCommentsWrapper } from './plan-engine/comments-wrappers.js';
import { writeWrapper, insertStructuredWrapper, styleApplyWrapper } from './plan-engine/plan-wrappers.js';
import { stylesApplyAdapter } from './styles-adapter.js';
import {
  formatFontSizeWrapper,
  formatFontFamilyWrapper,
  formatColorWrapper,
  formatAlignWrapper,
} from './plan-engine/format-value-wrappers.js';
import {
  trackChangesListWrapper,
  trackChangesGetWrapper,
  trackChangesAcceptWrapper,
  trackChangesRejectWrapper,
  trackChangesAcceptAllWrapper,
  trackChangesRejectAllWrapper,
} from './plan-engine/track-changes-wrappers.js';
import { createParagraphWrapper, createHeadingWrapper } from './plan-engine/create-wrappers.js';
import { blocksDeleteWrapper } from './plan-engine/blocks-wrappers.js';
import {
  listsListWrapper,
  listsGetWrapper,
  listsInsertWrapper,
  listsSetTypeWrapper,
  listsIndentWrapper,
  listsOutdentWrapper,
  listsRestartWrapper,
  listsExitWrapper,
} from './plan-engine/lists-wrappers.js';
import { executePlan } from './plan-engine/executor.js';
import { previewPlan } from './plan-engine/preview.js';
import { queryMatchAdapter } from './plan-engine/query-match-adapter.js';
import { initRevision, trackRevisions } from './plan-engine/revision-tracker.js';
import { registerBuiltInExecutors } from './plan-engine/register-executors.js';
import { createTableWrapper } from './plan-engine/create-table-wrapper.js';
import {
  tablesDeleteWrapper,
  tablesClearContentsWrapper,
  tablesMoveWrapper,
  tablesSetLayoutWrapper,
  tablesSetAltTextWrapper,
  tablesConvertFromTextWrapper,
  tablesSplitWrapper,
  tablesConvertToTextWrapper,
  tablesInsertRowWrapper,
  tablesDeleteRowWrapper,
  tablesSetRowHeightWrapper,
  tablesDistributeRowsWrapper,
  tablesSetRowOptionsWrapper,
  tablesInsertColumnWrapper,
  tablesDeleteColumnWrapper,
  tablesSetColumnWidthWrapper,
  tablesDistributeColumnsWrapper,
  tablesInsertCellWrapper,
  tablesDeleteCellWrapper,
  tablesMergeCellsWrapper,
  tablesUnmergeCellsWrapper,
  tablesSplitCellWrapper,
  tablesSetCellPropertiesWrapper,
  tablesSortWrapper,
  tablesSetStyleWrapper,
  tablesClearStyleWrapper,
  tablesSetStyleOptionWrapper,
  tablesSetBorderWrapper,
  tablesClearBorderWrapper,
  tablesApplyBorderPresetWrapper,
  tablesSetShadingWrapper,
  tablesClearShadingWrapper,
  tablesSetTablePaddingWrapper,
  tablesSetCellPaddingWrapper,
  tablesSetCellSpacingWrapper,
  tablesClearCellSpacingWrapper,
} from './plan-engine/tables-wrappers.js';
import { tablesGetAdapter, tablesGetCellsAdapter, tablesGetPropertiesAdapter } from './tables-adapter.js';

/**
 * Assembles all document-api adapters for the given editor instance.
 *
 * @param editor - The editor instance to bind adapters to.
 * @returns A {@link DocumentApiAdapters} object ready to pass to `createDocumentApi()`.
 */
export function assembleDocumentApiAdapters(editor: Editor): DocumentApiAdapters {
  registerBuiltInExecutors();
  initRevision(editor);
  trackRevisions(editor);

  return {
    find: {
      find: (query) => findAdapter(editor, query),
    },
    getNode: {
      getNode: (address) => getNodeAdapter(editor, address),
      getNodeById: (input) => getNodeByIdAdapter(editor, input),
    },
    getText: {
      getText: (input) => getTextAdapter(editor, input),
    },
    info: {
      info: (input) => infoAdapter(editor, input),
    },
    capabilities: {
      get: () => getDocumentApiCapabilities(editor),
    },
    comments: createCommentsWrapper(editor),
    write: {
      write: (request, options) => writeWrapper(editor, request, options),
      insertStructured: (input, options) => insertStructuredWrapper(editor, input, options),
    },
    format: {
      apply: (input, options) => styleApplyWrapper(editor, input, options),
      fontSize: (input, options) => formatFontSizeWrapper(editor, input, options),
      fontFamily: (input, options) => formatFontFamilyWrapper(editor, input, options),
      color: (input, options) => formatColorWrapper(editor, input, options),
      align: (input, options) => formatAlignWrapper(editor, input, options),
    },
    styles: {
      apply: (input, options) => stylesApplyAdapter(editor, input, options),
    },
    trackChanges: {
      list: (input) => trackChangesListWrapper(editor, input),
      get: (input) => trackChangesGetWrapper(editor, input),
      accept: (input, options) => trackChangesAcceptWrapper(editor, input, options),
      reject: (input, options) => trackChangesRejectWrapper(editor, input, options),
      acceptAll: (input, options) => trackChangesAcceptAllWrapper(editor, input, options),
      rejectAll: (input, options) => trackChangesRejectAllWrapper(editor, input, options),
    },
    blocks: {
      delete: (input, options) => blocksDeleteWrapper(editor, input, options),
    },
    create: {
      paragraph: (input, options) => createParagraphWrapper(editor, input, options),
      heading: (input, options) => createHeadingWrapper(editor, input, options),
      table: (input, options) => createTableWrapper(editor, input, options),
    },
    lists: {
      list: (query) => listsListWrapper(editor, query),
      get: (input) => listsGetWrapper(editor, input),
      insert: (input, options) => listsInsertWrapper(editor, input, options),
      setType: (input, options) => listsSetTypeWrapper(editor, input, options),
      indent: (input, options) => listsIndentWrapper(editor, input, options),
      outdent: (input, options) => listsOutdentWrapper(editor, input, options),
      restart: (input, options) => listsRestartWrapper(editor, input, options),
      exit: (input, options) => listsExitWrapper(editor, input, options),
    },
    tables: {
      convertFromText: (input, options) => tablesConvertFromTextWrapper(editor, input, options),
      delete: (input, options) => tablesDeleteWrapper(editor, input, options),
      clearContents: (input, options) => tablesClearContentsWrapper(editor, input, options),
      move: (input, options) => tablesMoveWrapper(editor, input, options),
      split: (input, options) => tablesSplitWrapper(editor, input, options),
      convertToText: (input, options) => tablesConvertToTextWrapper(editor, input, options),
      setLayout: (input, options) => tablesSetLayoutWrapper(editor, input, options),
      insertRow: (input, options) => tablesInsertRowWrapper(editor, input, options),
      deleteRow: (input, options) => tablesDeleteRowWrapper(editor, input, options),
      setRowHeight: (input, options) => tablesSetRowHeightWrapper(editor, input, options),
      distributeRows: (input, options) => tablesDistributeRowsWrapper(editor, input, options),
      setRowOptions: (input, options) => tablesSetRowOptionsWrapper(editor, input, options),
      insertColumn: (input, options) => tablesInsertColumnWrapper(editor, input, options),
      deleteColumn: (input, options) => tablesDeleteColumnWrapper(editor, input, options),
      setColumnWidth: (input, options) => tablesSetColumnWidthWrapper(editor, input, options),
      distributeColumns: (input, options) => tablesDistributeColumnsWrapper(editor, input, options),
      insertCell: (input, options) => tablesInsertCellWrapper(editor, input, options),
      deleteCell: (input, options) => tablesDeleteCellWrapper(editor, input, options),
      mergeCells: (input, options) => tablesMergeCellsWrapper(editor, input, options),
      unmergeCells: (input, options) => tablesUnmergeCellsWrapper(editor, input, options),
      splitCell: (input, options) => tablesSplitCellWrapper(editor, input, options),
      setCellProperties: (input, options) => tablesSetCellPropertiesWrapper(editor, input, options),
      sort: (input, options) => tablesSortWrapper(editor, input, options),
      setAltText: (input, options) => tablesSetAltTextWrapper(editor, input, options),
      setStyle: (input, options) => tablesSetStyleWrapper(editor, input, options),
      clearStyle: (input, options) => tablesClearStyleWrapper(editor, input, options),
      setStyleOption: (input, options) => tablesSetStyleOptionWrapper(editor, input, options),
      setBorder: (input, options) => tablesSetBorderWrapper(editor, input, options),
      clearBorder: (input, options) => tablesClearBorderWrapper(editor, input, options),
      applyBorderPreset: (input, options) => tablesApplyBorderPresetWrapper(editor, input, options),
      setShading: (input, options) => tablesSetShadingWrapper(editor, input, options),
      clearShading: (input, options) => tablesClearShadingWrapper(editor, input, options),
      setTablePadding: (input, options) => tablesSetTablePaddingWrapper(editor, input, options),
      setCellPadding: (input, options) => tablesSetCellPaddingWrapper(editor, input, options),
      setCellSpacing: (input, options) => tablesSetCellSpacingWrapper(editor, input, options),
      clearCellSpacing: (input, options) => tablesClearCellSpacingWrapper(editor, input, options),
      get: (input) => tablesGetAdapter(editor, input),
      getCells: (input) => tablesGetCellsAdapter(editor, input),
      getProperties: (input) => tablesGetPropertiesAdapter(editor, input),
    },
    query: {
      match: (input) => queryMatchAdapter(editor, input),
    },
    mutations: {
      preview: (input) => previewPlan(editor, input),
      apply: (input) => executePlan(editor, input),
    },
  };
}
