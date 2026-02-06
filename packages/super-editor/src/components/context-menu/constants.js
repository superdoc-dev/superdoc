import plusIconSvg from '@superdoc/common/icons/plus-solid.svg?raw';
import trashIconSvg from '@superdoc/common/icons/trash-can-solid.svg?raw';
import wrenchIconSvg from '@superdoc/common/icons/wrench-solid.svg?raw';
import borderNoneIconSvg from '@superdoc/common/icons/border-none-solid.svg?raw';
import arrowsLeftRightIconSvg from '@superdoc/common/icons/arrows-left-right-solid.svg?raw';
import arrowsToDotIconSvg from '@superdoc/common/icons/arrows-to-dot-solid.svg?raw';
import magicWandIcon from '@superdoc/common/icons/magic-wand-solid.svg?raw';
import linkIconSvg from '@superdoc/common/icons/link-solid.svg?raw';
import tableIconSvg from '@superdoc/common/icons/table-solid.svg?raw';
import scissorsIconSvg from '@superdoc/common/icons/scissors-solid.svg?raw';
import copyIconSvg from '@superdoc/common/icons/copy-solid.svg?raw';
import pasteIconSvg from '@superdoc/common/icons/paste-solid.svg?raw';
import checkIconSvg from '@superdoc/common/icons/check-solid.svg?raw';
import xMarkIconSvg from '@superdoc/common/icons/xmark-solid.svg?raw';

export const ICONS = {
  addRowBefore: plusIconSvg,
  addRowAfter: plusIconSvg,
  addColumnBefore: plusIconSvg,
  addColumnAfter: plusIconSvg,
  deleteRow: trashIconSvg,
  deleteColumn: trashIconSvg,
  deleteTable: trashIconSvg,
  deleteBorders: borderNoneIconSvg,
  mergeCells: arrowsToDotIconSvg,
  splitCell: arrowsLeftRightIconSvg,
  fixTables: wrenchIconSvg,
  ai: magicWandIcon,
  link: linkIconSvg,
  table: tableIconSvg,
  cut: scissorsIconSvg,
  copy: copyIconSvg,
  paste: pasteIconSvg,
  addDocumentSection: plusIconSvg,
  removeDocumentSection: trashIconSvg,
  trackChangesAccept: checkIconSvg,
  trackChangesReject: xMarkIconSvg,
};

// Table actions constant
export const TEXTS = {
  addRowBefore: 'Insert row above',
  addRowAfter: 'Insert row below',
  addColumnBefore: 'Insert column left',
  addColumnAfter: 'Insert column right',
  deleteRow: 'Delete row',
  deleteColumn: 'Delete column',
  deleteTable: 'Delete table',
  removeBorders: 'Remove borders',
  mergeCells: 'Merge cells',
  splitCell: 'Split cell',
  fixTables: 'Fix tables',
  insertText: 'Insert text',
  replaceText: 'Replace text',
  insertLink: 'Insert link',
  insertTable: 'Insert table',
  editTable: 'Edit table',
  cut: 'Cut',
  copy: 'Copy',
  paste: 'Paste',
  removeDocumentSection: 'Remove section',
  createDocumentSection: 'Create section',
  trackChangesAccept: 'Accept change',
  trackChangesReject: 'Reject change',
};

export const tableActionsOptions = [
  {
    label: TEXTS.addRowBefore,
    command: 'addRowBefore',
    icon: ICONS.addRowBefore,
    props: {
      'data-item': 'btn-tableActions-option',
      ariaLabel: 'Add row before',
    },
  },
  {
    label: TEXTS.addRowAfter,
    command: 'addRowAfter',
    icon: ICONS.addRowAfter,
    props: {
      'data-item': 'btn-tableActions-option',
      ariaLabel: 'Add row after',
    },
  },
  {
    label: TEXTS.addColumnBefore,
    command: 'addColumnBefore',
    icon: ICONS.addColumnBefore,
    props: {
      'data-item': 'btn-tableActions-option',
      ariaLabel: 'Add column before',
    },
  },
  {
    label: TEXTS.addColumnAfter,
    command: 'addColumnAfter',
    icon: ICONS.addColumnAfter,
    bottomBorder: true,
    props: {
      'data-item': 'btn-tableActions-option',
      ariaLabel: 'Add column after',
    },
  },
  {
    label: TEXTS.deleteRow,
    command: 'deleteRow',
    icon: ICONS.deleteRow,
    props: {
      'data-item': 'btn-tableActions-option',
      ariaLabel: 'Delete row',
    },
  },
  {
    label: TEXTS.deleteColumn,
    command: 'deleteColumn',
    icon: ICONS.deleteColumn,
    props: {
      'data-item': 'btn-tableActions-option',
      ariaLabel: 'Delete column',
    },
  },
  {
    label: TEXTS.deleteTable,
    command: 'deleteTable',
    icon: ICONS.deleteTable,
    props: {
      'data-item': 'btn-tableActions-option',
      ariaLabel: 'Delete table',
    },
  },
  {
    label: TEXTS.removeBorders,
    command: 'deleteCellAndTableBorders',
    icon: ICONS.deleteBorders,
    bottomBorder: true,
    props: {
      'data-item': 'btn-tableActions-option',
      ariaLabel: 'Delete cell and table borders',
    },
  },
  {
    label: TEXTS.mergeCells,
    command: 'mergeCells',
    icon: ICONS.mergeCells,
    props: {
      'data-item': 'btn-tableActions-option',
      ariaLabel: 'Merge cells',
    },
  },
  {
    label: TEXTS.splitCell,
    command: 'splitCell',
    icon: ICONS.splitCell,
    props: {
      'data-item': 'btn-tableActions-option',
      ariaLabel: 'Split cells',
    },
  },
  {
    label: TEXTS.fixTables,
    command: 'fixTables',
    icon: ICONS.fixTables,
    props: {
      'data-item': 'btn-tableActions-option',
      ariaLabel: 'Fix tables',
    },
  },
];

export const TRIGGERS = {
  slash: 'slash',
  click: 'click',
};
