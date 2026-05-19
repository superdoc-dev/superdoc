export const TOOLBAR_FONTS = [
  {
    label: 'Georgia',
    key: 'Georgia, serif',
    fontWeight: 400,
    props: {
      style: { fontFamily: 'Georgia, serif' },
      'data-item': 'btn-fontFamily-option',
    },
  },
  {
    label: 'Arial',
    key: 'Arial, sans-serif',
    fontWeight: 400,
    props: {
      style: { fontFamily: 'Arial, sans-serif' },
      'data-item': 'btn-fontFamily-option',
    },
  },
  {
    label: 'Courier New',
    key: 'Courier New, monospace',
    fontWeight: 400,
    props: {
      style: { fontFamily: 'Courier New, monospace' },
      'data-item': 'btn-fontFamily-option',
    },
  },
  {
    label: 'Times New Roman',
    key: 'Times New Roman, serif',
    fontWeight: 400,
    props: {
      style: { fontFamily: 'Times New Roman, serif' },
      'data-item': 'btn-fontFamily-option',
    },
  },
];

export const TOOLBAR_FONT_SIZES = [
  { label: '8', key: '8pt', props: { 'data-item': 'btn-fontSize-option' } },
  { label: '9', key: '9pt', props: { 'data-item': 'btn-fontSize-option' } },
  { label: '10', key: '10pt', props: { 'data-item': 'btn-fontSize-option' } },
  { label: '11', key: '11pt', props: { 'data-item': 'btn-fontSize-option' } },
  { label: '12', key: '12pt', props: { 'data-item': 'btn-fontSize-option' } },
  { label: '14', key: '14pt', props: { 'data-item': 'btn-fontSize-option' } },
  { label: '18', key: '18pt', props: { 'data-item': 'btn-fontSize-option' } },
  { label: '24', key: '24pt', props: { 'data-item': 'btn-fontSize-option' } },
  { label: '30', key: '30pt', props: { 'data-item': 'btn-fontSize-option' } },
  { label: '36', key: '36pt', props: { 'data-item': 'btn-fontSize-option' } },
  { label: '48', key: '48pt', props: { 'data-item': 'btn-fontSize-option' } },
  { label: '60', key: '60pt', props: { 'data-item': 'btn-fontSize-option' } },
  { label: '72', key: '72pt', props: { 'data-item': 'btn-fontSize-option' } },
  { label: '96', key: '96pt', props: { 'data-item': 'btn-fontSize-option' } },
];

export const RESPONSIVE_BREAKPOINTS = {
  sm: 768,
  md: 1024,
  lg: 1280,
  xl: 1410,
};

export const HEADLESS_ITEM_MAP = {
  undo: 'undo',
  redo: 'redo',
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strike: 'strikethrough',
  acceptTrackedChangeBySelection: 'track-changes-accept-selection',
  rejectTrackedChangeOnSelection: 'track-changes-reject-selection',
  ruler: 'ruler',
  formattingMarks: 'formatting-marks',
  zoom: 'zoom',
  documentMode: 'document-mode',
  link: 'link',
  fontFamily: 'font-family',
  fontSize: 'font-size',
  list: 'bullet-list',
  numberedlist: 'numbered-list',
  table: 'table-insert',
  image: 'image',
  tableOfContents: 'table-of-contents-insert',
  color: 'text-color',
  highlight: 'highlight-color',
  textAlign: 'text-align',
  lineHeight: 'line-height',
  linkedStyles: 'linked-style',
  indentleft: 'indent-decrease',
  indentright: 'indent-increase',
  directionLtr: 'direction-ltr',
  directionRtl: 'direction-rtl',
  clearFormatting: 'clear-formatting',
  copyFormat: 'copy-format',
};

export const TABLE_ACTION_COMMAND_MAP = {
  addRowBefore: 'table-add-row-before',
  addRowAfter: 'table-add-row-after',
  deleteRow: 'table-delete-row',
  addColumnBefore: 'table-add-column-before',
  addColumnAfter: 'table-add-column-after',
  deleteColumn: 'table-delete-column',
  deleteTable: 'table-delete',
  deleteCellAndTableBorders: 'table-remove-borders',
  mergeCells: 'table-merge-cells',
  splitCell: 'table-split-cell',
  fixTables: 'table-fix',
};

export const TABLE_ACTION_COMMAND_IDS = Object.values(TABLE_ACTION_COMMAND_MAP);

export const HEADLESS_TOOLBAR_COMMANDS = [
  ...new Set([...Object.values(HEADLESS_ITEM_MAP), ...TABLE_ACTION_COMMAND_IDS]),
];

const NON_HEADLESS_EXECUTE_ITEM_NAMES = new Set(['link']);

export const HEADLESS_EXECUTE_ITEMS = new Set(
  Object.keys(HEADLESS_ITEM_MAP).filter((itemName) => !NON_HEADLESS_EXECUTE_ITEM_NAMES.has(itemName)),
);
