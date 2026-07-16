import {
  BASELINE_BUNDLED,
  fontOfferingRenderStack,
  fontOfferingStack,
  getBuiltInToolbarFontOfferings,
} from '@superdoc/font-system';

/**
 * Build the built-in toolbar font dropdown options for a bundled-font activation, DERIVED from the
 * shared font-offering registry (`@superdoc/font-system`). Without a configured pack this is the
 * conservative baseline; with one it is the curated rich set.
 *
 * Per `FontConfig`: `label` is the Word-facing logical name (stored on the selection + active-state
 * match), `key` is the logical CSS stack, and the row preview renders in the physical clone that
 * actually paints (e.g. Carlito), so the dropdown looks like the rendered result.
 *
 * @param {import('@superdoc/font-system').BundledActivation} [activation]
 */
export function toolbarFontOptionsFor(activation = BASELINE_BUNDLED) {
  return getBuiltInToolbarFontOfferings(activation).map((offering) => ({
    label: offering.logicalFamily,
    key: fontOfferingStack(offering),
    fontWeight: 400,
    props: {
      style: { fontFamily: fontOfferingRenderStack(offering) },
      'data-item': 'btn-fontFamily-option',
    },
  }));
}

/**
 * Static baseline dropdown options (no pack configured). The fallback when a toolbar has no live
 * activation to build from; the live path uses {@link composeToolbarFontOptions} with the document's
 * activation so a configured pack shows the rich set.
 */
export const TOOLBAR_FONTS = toolbarFontOptionsFor(BASELINE_BUNDLED);

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
 * {@link import('@superdoc/font-system').DocumentFontOption}s into toolbar font options, unions them
 * with the activation-gated built-in base (baseline without a configured pack, the curated rich set
 * with one), dedupes by normalized logical family, and sorts by visible name. A consumer-provided
 * `configFonts` list is returned unchanged. Returns `undefined` only when the base is the baseline and
 * there are no document fonts, so the caller can keep the equal static {@link TOOLBAR_FONTS} const.
 *
 * @param {ReadonlyArray<import('@superdoc/font-system').DocumentFontOption>} documentOptions
 * @param {Array} [configFonts] - the consumer's `fonts` config, if any
 * @param {import('@superdoc/font-system').BundledActivation} [activation] - the document's bundled-font activation
 * @returns {Array|undefined}
 */
export function composeToolbarFontOptions(documentOptions, configFonts, activation = BASELINE_BUNDLED) {
  if (configFonts) return configFonts;
  // Baseline base AND no document fonts is identical to the static TOOLBAR_FONTS const: let the
  // caller keep that const instead of rebuilding an equal array.
  if (!activation.packConfigured && !documentOptions?.length) return undefined;
  const base = toolbarFontOptionsFor(activation);
  const seen = new Set(base.map((option) => normalizeToolbarFamily(option.label)));
  const merged = [...base];
  for (const option of documentOptions ?? []) {
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
  return merged.sort(compareToolbarFontOptions);
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
