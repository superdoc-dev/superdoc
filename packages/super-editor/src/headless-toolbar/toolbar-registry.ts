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
      mode: 'hybrid',
      directCommandName: 'toggleBold',
      state: createBoldStateDeriver(),
      execute: createBoldExecute(),
    },
    italic: {
      id: 'italic',
      mode: 'hybrid',
      directCommandName: 'toggleItalic',
      state: createItalicStateDeriver(),
      execute: createItalicExecute(),
    },
    underline: {
      id: 'underline',
      mode: 'hybrid',
      directCommandName: 'toggleUnderline',
      state: createUnderlineStateDeriver(),
      execute: createUnderlineExecute(),
    },
    strikethrough: {
      id: 'strikethrough',
      mode: 'direct',
      directCommandName: 'toggleStrike',
      state: createStrikethroughStateDeriver(),
    },
    'font-size': {
      id: 'font-size',
      mode: 'hybrid',
      directCommandName: 'setFontSize',
      // State parity is close to legacy; full item parity still needs sticky/off-focus stored-mark behavior.
      state: createFontSizeStateDeriver(),
      execute: createFontSizeExecute(),
    },
    'font-family': {
      id: 'font-family',
      mode: 'hybrid',
      directCommandName: 'setFontFamily',
      // Paragraph-font fallback for empty collapsed paragraphs from legacy toolbar is still follow-up work.
      state: createFontFamilyStateDeriver(),
      execute: createFontFamilyExecute(),
    },
    'text-color': {
      id: 'text-color',
      mode: 'hybrid',
      directCommandName: 'setColor',
      state: createTextColorStateDeriver(),
      execute: createTextColorExecute(),
    },
    'highlight-color': {
      id: 'highlight-color',
      mode: 'hybrid',
      directCommandName: 'setHighlight',
      state: createHighlightColorStateDeriver(),
      execute: createHighlightColorExecute(),
    },
    link: {
      id: 'link',
      mode: 'hybrid',
      directCommandName: 'toggleLink',
      state: createLinkStateDeriver(),
      execute: createLinkExecute(),
    },

    // Paragraph/block items
    'text-align': {
      id: 'text-align',
      mode: 'direct',
      directCommandName: 'setTextAlign',
      state: createTextAlignStateDeriver(),
    },
    'line-height': {
      id: 'line-height',
      mode: 'direct',
      directCommandName: 'setLineHeight',
      state: createLineHeightStateDeriver(),
    },
    'linked-style': {
      id: 'linked-style',
      mode: 'hybrid',
      directCommandName: 'setLinkedStyle',
      state: createLinkedStyleStateDeriver(),
      execute: createDirectCommandExecute('setLinkedStyle'),
    },
    'bullet-list': {
      id: 'bullet-list',
      mode: 'hybrid',
      directCommandName: 'toggleBulletList',
      state: createListStateDeriver('bullet'),
    },
    'numbered-list': {
      id: 'numbered-list',
      mode: 'hybrid',
      directCommandName: 'toggleOrderedList',
      state: createListStateDeriver('ordered'),
    },
    'indent-increase': {
      id: 'indent-increase',
      mode: 'execute',
      state: createDisabledStateDeriver(),
      execute: createIndentIncreaseExecute(),
    },
    'indent-decrease': {
      id: 'indent-decrease',
      mode: 'execute',
      state: createDisabledStateDeriver(),
      execute: createIndentDecreaseExecute(),
    },

    // History/document-level items
    undo: {
      id: 'undo',
      mode: 'direct',
      directCommandName: 'undo',
      state: createHistoryStateDeriver('undo'),
    },
    redo: {
      id: 'redo',
      mode: 'direct',
      directCommandName: 'redo',
      state: createHistoryStateDeriver('redo'),
    },
    ruler: {
      id: 'ruler',
      mode: 'execute',
      state: createRulerStateDeriver(),
      execute: createRulerExecute(),
    },
    zoom: {
      id: 'zoom',
      mode: 'execute',
      state: createZoomStateDeriver(),
      execute: createZoomExecute(),
    },
    'document-mode': {
      id: 'document-mode',
      mode: 'execute',
      state: createDocumentModeStateDeriver(),
      execute: createDocumentModeExecute(),
    },

    // Utility items
    'clear-formatting': {
      id: 'clear-formatting',
      mode: 'direct',
      directCommandName: 'clearFormat',
      state: createDisabledStateDeriver(),
    },
    'copy-format': {
      id: 'copy-format',
      mode: 'direct',
      directCommandName: 'copyFormat',
      state: createDisabledStateDeriver(),
    },
    'track-changes-accept-selection': {
      id: 'track-changes-accept-selection',
      mode: 'direct',
      directCommandName: 'acceptTrackedChangeFromToolbar',
      state: createTrackChangesSelectionActionStateDeriver('accept'),
    },
    'track-changes-reject-selection': {
      id: 'track-changes-reject-selection',
      mode: 'direct',
      directCommandName: 'rejectTrackedChangeFromToolbar',
      state: createTrackChangesSelectionActionStateDeriver('reject'),
    },
    image: {
      id: 'image',
      mode: 'special',
      state: createDisabledStateDeriver(),
    },

    // Table items
    'table-insert': {
      id: 'table-insert',
      mode: 'hybrid',
      directCommandName: 'insertTable',
      state: createDisabledStateDeriver(),
      execute: createDirectCommandExecute('insertTable'),
    },
    'table-add-row-before': {
      id: 'table-add-row-before',
      mode: 'direct',
      directCommandName: 'addRowBefore',
      state: createTableActionsStateDeriver(),
    },
    'table-add-row-after': {
      id: 'table-add-row-after',
      mode: 'direct',
      directCommandName: 'addRowAfter',
      state: createTableActionsStateDeriver(),
    },
    'table-delete-row': {
      id: 'table-delete-row',
      mode: 'direct',
      directCommandName: 'deleteRow',
      state: createTableActionsStateDeriver(),
    },
    'table-add-column-before': {
      id: 'table-add-column-before',
      mode: 'direct',
      directCommandName: 'addColumnBefore',
      state: createTableActionsStateDeriver(),
    },
    'table-add-column-after': {
      id: 'table-add-column-after',
      mode: 'direct',
      directCommandName: 'addColumnAfter',
      state: createTableActionsStateDeriver(),
    },
    'table-delete-column': {
      id: 'table-delete-column',
      mode: 'direct',
      directCommandName: 'deleteColumn',
      state: createTableActionsStateDeriver(),
    },
    'table-delete': {
      id: 'table-delete',
      mode: 'direct',
      directCommandName: 'deleteTable',
      state: createTableActionsStateDeriver(),
    },
    'table-merge-cells': {
      id: 'table-merge-cells',
      mode: 'direct',
      directCommandName: 'mergeCells',
      state: createTableActionsStateDeriver(),
    },
    'table-split-cell': {
      id: 'table-split-cell',
      mode: 'direct',
      directCommandName: 'splitCell',
      state: createTableActionsStateDeriver(),
    },
    'table-remove-borders': {
      id: 'table-remove-borders',
      mode: 'direct',
      directCommandName: 'deleteCellAndTableBorders',
      state: createTableActionsStateDeriver(),
    },
    'table-fix': {
      id: 'table-fix',
      mode: 'direct',
      directCommandName: 'fixTables',
      state: createTableActionsStateDeriver(),
    },
  };
};
