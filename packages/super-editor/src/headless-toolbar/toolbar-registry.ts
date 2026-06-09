import {
  createDocumentModeExecute,
  createDocumentModeStateDeriver,
  createDocumentOperationCapabilityStateDeriver,
  createFormattingMarksExecute,
  createFormattingMarksStateDeriver,
  createHistoryStateDeriver,
  createRulerExecute,
  createRulerStateDeriver,
  createZoomExecute,
  createZoomFitWidthExecute,
  createZoomFitWidthStateDeriver,
  createZoomStateDeriver,
} from './helpers/document.js';
import {
  createBoldStateDeriver,
  createBoldExecute,
  createCopyFormatStateDeriver,
  createFontFamilyExecute,
  createFontFamilyStateDeriver,
  createFontSizeExecute,
  createFontSizeStateDeriver,
  createHighlightColorExecute,
  createHighlightColorStateDeriver,
  createImageExecute,
  createItalicStateDeriver,
  createItalicExecute,
  createLinkExecute,
  createLinkStateDeriver,
  createStrikethroughStateDeriver,
  createTextColorExecute,
  createTextColorStateDeriver,
  createUnderlineStateDeriver,
  createUnderlineExecute,
} from './helpers/formatting.js';
import {
  createBulletListExecute,
  createIndentDecreaseExecute,
  createIndentIncreaseExecute,
  createLineHeightStateDeriver,
  createLinkedStyleStateDeriver,
  createListStateDeriver,
  createOrderedListExecute,
  createParagraphDirectionExecute,
  createParagraphDirectionStateDeriver,
  createTextAlignStateDeriver,
} from './helpers/paragraph.js';
import { createDirectCommandExecute, createDisabledStateDeriver } from './helpers/general.js';
import { createTableOfContentsInsertExecute } from './helpers/table-of-contents.js';
import { createTableActionsStateDeriver } from './helpers/table.js';
import { createTrackChangesSelectionActionStateDeriver } from './helpers/track-changes.js';
import type { BuiltInToolbarRegistryEntry } from './internal-types.js';
import type { PublicToolbarItemId } from './types.js';

export const createToolbarRegistry = (): Partial<Record<PublicToolbarItemId, BuiltInToolbarRegistryEntry>> => {
  return {
    // Inline/text items
    bold: {
      id: 'bold',
      directCommandName: 'toggleBold',
      state: createBoldStateDeriver(),
      execute: createBoldExecute(),
    },
    italic: {
      id: 'italic',
      directCommandName: 'toggleItalic',
      state: createItalicStateDeriver(),
      execute: createItalicExecute(),
    },
    underline: {
      id: 'underline',
      directCommandName: 'toggleUnderline',
      state: createUnderlineStateDeriver(),
      execute: createUnderlineExecute(),
    },
    strikethrough: {
      id: 'strikethrough',
      directCommandName: 'toggleStrike',
      state: createStrikethroughStateDeriver(),
    },
    'font-size': {
      id: 'font-size',
      directCommandName: 'setFontSize',
      // State parity is close to legacy; full item parity still needs sticky/off-focus stored-mark behavior.
      state: createFontSizeStateDeriver(),
      execute: createFontSizeExecute(),
    },
    'font-family': {
      id: 'font-family',
      directCommandName: 'setFontFamily',
      // Paragraph-font fallback for empty collapsed paragraphs from legacy toolbar is still follow-up work.
      state: createFontFamilyStateDeriver(),
      execute: createFontFamilyExecute(),
    },
    'text-color': {
      id: 'text-color',
      directCommandName: 'setColor',
      state: createTextColorStateDeriver(),
      execute: createTextColorExecute(),
    },
    'highlight-color': {
      id: 'highlight-color',
      directCommandName: 'setHighlight',
      state: createHighlightColorStateDeriver(),
      execute: createHighlightColorExecute(),
    },
    link: {
      id: 'link',
      directCommandName: 'toggleLink',
      state: createLinkStateDeriver(),
      execute: createLinkExecute(),
    },

    // Paragraph/block items
    'text-align': {
      id: 'text-align',
      directCommandName: 'setTextAlign',
      state: createTextAlignStateDeriver(),
    },
    'line-height': {
      id: 'line-height',
      directCommandName: 'setLineHeight',
      state: createLineHeightStateDeriver(),
    },
    'linked-style': {
      id: 'linked-style',
      directCommandName: 'setLinkedStyle',
      state: createLinkedStyleStateDeriver(),
      execute: createDirectCommandExecute('setLinkedStyle'),
    },
    'bullet-list': {
      id: 'bullet-list',
      directCommandName: 'toggleBulletListStyle',
      state: createListStateDeriver('bullet'),
      execute: createBulletListExecute(),
    },
    'numbered-list': {
      id: 'numbered-list',
      directCommandName: 'toggleOrderedListStyle',
      state: createListStateDeriver('ordered'),
      execute: createOrderedListExecute(),
    },
    'indent-increase': {
      id: 'indent-increase',
      state: createDisabledStateDeriver(),
      execute: createIndentIncreaseExecute(),
    },
    'indent-decrease': {
      id: 'indent-decrease',
      state: createDisabledStateDeriver(),
      execute: createIndentDecreaseExecute(),
    },
    'direction-ltr': {
      id: 'direction-ltr',
      directCommandName: 'setParagraphDirection',
      state: createParagraphDirectionStateDeriver('ltr'),
      execute: createParagraphDirectionExecute('ltr'),
    },
    'direction-rtl': {
      id: 'direction-rtl',
      directCommandName: 'setParagraphDirection',
      state: createParagraphDirectionStateDeriver('rtl'),
      execute: createParagraphDirectionExecute('rtl'),
    },

    // History/document-level items
    undo: {
      id: 'undo',
      directCommandName: 'undo',
      state: createHistoryStateDeriver('undo'),
    },
    redo: {
      id: 'redo',
      directCommandName: 'redo',
      state: createHistoryStateDeriver('redo'),
    },
    ruler: {
      id: 'ruler',
      state: createRulerStateDeriver(),
      execute: createRulerExecute(),
    },
    'formatting-marks': {
      id: 'formatting-marks',
      state: createFormattingMarksStateDeriver(),
      execute: createFormattingMarksExecute(),
    },
    zoom: {
      id: 'zoom',
      state: createZoomStateDeriver(),
      execute: createZoomExecute(),
    },
    'zoom-fit-width': {
      id: 'zoom-fit-width',
      state: createZoomFitWidthStateDeriver(),
      execute: createZoomFitWidthExecute(),
    },
    'document-mode': {
      id: 'document-mode',
      state: createDocumentModeStateDeriver(),
      execute: createDocumentModeExecute(),
    },

    // Utility items
    'clear-formatting': {
      id: 'clear-formatting',
      directCommandName: 'clearFormat',
      state: createDisabledStateDeriver(),
    },
    'copy-format': {
      id: 'copy-format',
      directCommandName: 'copyFormat',
      state: createCopyFormatStateDeriver(),
    },
    'track-changes-accept-selection': {
      id: 'track-changes-accept-selection',
      directCommandName: 'acceptTrackedChangeFromToolbar',
      state: createTrackChangesSelectionActionStateDeriver('accept'),
    },
    'track-changes-reject-selection': {
      id: 'track-changes-reject-selection',
      directCommandName: 'rejectTrackedChangeFromToolbar',
      state: createTrackChangesSelectionActionStateDeriver('reject'),
    },
    image: {
      id: 'image',
      state: createDisabledStateDeriver(),
      execute: createImageExecute(),
    },
    'table-of-contents-insert': {
      id: 'table-of-contents-insert',
      state: createDocumentOperationCapabilityStateDeriver('create.tableOfContents'),
      execute: createTableOfContentsInsertExecute(),
    },

    // Table items
    'table-insert': {
      id: 'table-insert',
      directCommandName: 'insertTable',
      state: createDisabledStateDeriver(),
      execute: createDirectCommandExecute('insertTable'),
    },
    'table-add-row-before': {
      id: 'table-add-row-before',
      directCommandName: 'addRowBefore',
      state: createTableActionsStateDeriver(),
    },
    'table-add-row-after': {
      id: 'table-add-row-after',
      directCommandName: 'addRowAfter',
      state: createTableActionsStateDeriver(),
    },
    'table-delete-row': {
      id: 'table-delete-row',
      directCommandName: 'deleteRow',
      state: createTableActionsStateDeriver(),
    },
    'table-add-column-before': {
      id: 'table-add-column-before',
      directCommandName: 'addColumnBefore',
      state: createTableActionsStateDeriver(),
    },
    'table-add-column-after': {
      id: 'table-add-column-after',
      directCommandName: 'addColumnAfter',
      state: createTableActionsStateDeriver(),
    },
    'table-delete-column': {
      id: 'table-delete-column',
      directCommandName: 'deleteColumn',
      state: createTableActionsStateDeriver(),
    },
    'table-delete': {
      id: 'table-delete',
      directCommandName: 'deleteTable',
      state: createTableActionsStateDeriver(),
    },
    'table-merge-cells': {
      id: 'table-merge-cells',
      directCommandName: 'mergeCells',
      state: createTableActionsStateDeriver(),
    },
    'table-split-cell': {
      id: 'table-split-cell',
      directCommandName: 'splitCell',
      state: createTableActionsStateDeriver(),
    },
    'table-remove-borders': {
      id: 'table-remove-borders',
      directCommandName: 'deleteCellAndTableBorders',
      state: createTableActionsStateDeriver(),
    },
    'table-fix': {
      id: 'table-fix',
      directCommandName: 'fixTables',
      state: createTableActionsStateDeriver(),
    },
  };
};
