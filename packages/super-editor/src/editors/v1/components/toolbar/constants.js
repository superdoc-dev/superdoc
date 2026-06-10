import { fontOfferingRenderStack, fontOfferingStack, getBuiltInToolbarFontOfferings } from '@superdoc/font-system';

/**
 * Built-in toolbar font dropdown options, DERIVED from the shared font-offering registry
 * (`@superdoc/font-system`) instead of a hand-maintained list. Bundled clean defaults and explicit
 * qualified choices are advertised; category fallbacks and unbundled candidates are intentionally
 * absent from the static defaults.
 *
 * Per `FontConfig`: `label` is the Word-facing logical name (stored on the selection + active-state
 * match), `key` is the logical CSS stack, and the row preview renders in the physical clone that
 * actually paints (e.g. Carlito), so the dropdown looks like the rendered result.
 */
export const TOOLBAR_FONTS = getBuiltInToolbarFontOfferings().map((offering) => ({
  label: offering.logicalFamily,
  key: fontOfferingStack(offering),
  fontWeight: 400,
  props: {
    style: { fontFamily: fontOfferingRenderStack(offering) },
    'data-item': 'btn-fontFamily-option',
  },
}));

function normalizeToolbarFamily(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function compareToolbarFontOptions(a, b) {
  return String(a.label ?? '')
    .trim()
    .localeCompare(String(b.label ?? '').trim(), 'en', { sensitivity: 'base' });
}

/**
 * The single seam that composes the font dropdown options: it turns the active document's
 * {@link import('@superdoc/font-system').DocumentFontOption}s into toolbar font options and unions them
 * with the bundled defaults. The toolbar only asks for the result; it does not know how a font previews.
 *
 * - A consumer-provided `configFonts` list is returned UNCHANGED (custom toolbars own their list).
 * - With no document options, returns `undefined` so the caller keeps its fallback to {@link TOOLBAR_FONTS}.
 * - Otherwise: bundled defaults and document fonts are deduped by normalized logical family, then sorted
 *   alphabetically by the visible font name. `label`/`key` stay the pure logical family (active-state
 *   matching + the stored value), and the preview renders in `previewFamily`.
 *
 * @param {ReadonlyArray<import('@superdoc/font-system').DocumentFontOption>} documentOptions
 * @param {Array} [configFonts] - the consumer's `fonts` config, if any
 * @returns {Array|undefined}
 */
export function composeToolbarFontOptions(documentOptions, configFonts) {
  if (configFonts) return configFonts;
  if (!documentOptions?.length) return undefined;
  const seen = new Set(TOOLBAR_FONTS.map((option) => normalizeToolbarFamily(option.label)));
  const merged = [...TOOLBAR_FONTS];
  for (const option of documentOptions) {
    const dedupeKey = normalizeToolbarFamily(option.logicalFamily);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    merged.push({
      label: option.logicalFamily,
      key: option.logicalFamily,
      fontWeight: 400,
      props: {
        style: { fontFamily: option.previewFamily || option.logicalFamily },
        'data-item': 'btn-fontFamily-option',
      },
    });
  }
  return merged.length > TOOLBAR_FONTS.length ? merged.sort(compareToolbarFontOptions) : undefined;
}

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
