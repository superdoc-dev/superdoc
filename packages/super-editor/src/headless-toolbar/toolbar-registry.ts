import {
  createDocumentModeExecute,
  createDocumentModeStateDeriver,
  createHistoryStateDeriver,
  createRulerExecute,
  createRulerStateDeriver,
  createZoomExecute,
  createZoomStateDeriver,
} from './helpers/document.js';
import {
  createBoldStateDeriver,
  createBoldExecute,
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
  createIndentDecreaseExecute,
  createIndentIncreaseExecute,
  createLineHeightStateDeriver,
  createLinkedStyleStateDeriver,
  createListStateDeriver,
  createTextAlignStateDeriver,
} from './helpers/paragraph.js';
import { createDirectCommandExecute, createDisabledStateDeriver } from './helpers/general.js';
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
      directCommandName: 'toggleBulletList',
      state: createListStateDeriver('bullet'),
    },
    'numbered-list': {
      id: 'numbered-list',
      directCommandName: 'toggleOrderedList',
      state: createListStateDeriver('ordered'),
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
    zoom: {
      id: 'zoom',
      state: createZoomStateDeriver(),
      execute: createZoomExecute(),
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
      state: createDisabledStateDeriver(),
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
