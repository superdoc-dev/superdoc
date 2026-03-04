/**
 * Single source of truth for `styles.apply` property definitions.
 *
 * This module is the leaf of the styles/ dependency graph — it imports nothing
 * from validation.ts, schema.ts, or apply.ts. All other styles modules import
 * from here.
 */

import { ST_UNDERLINE_VALUES } from '../inline-semantics/token-sets.js';

// ---------------------------------------------------------------------------
// OOXML Token Constants
// ---------------------------------------------------------------------------

export const ST_VERTICAL_ALIGN_RUN = ['superscript', 'subscript', 'baseline'] as const;
export const ST_EM = ['none', 'dot', 'comma', 'circle', 'sesame'] as const;
export const ST_TEXT_ALIGNMENT = ['top', 'center', 'baseline', 'bottom', 'auto'] as const;
export const ST_TEXT_DIRECTION = ['lrTb', 'tbRl', 'btLr', 'lrTbV', 'tbRlV', 'tbLrV'] as const;
export const ST_TEXTBOX_TIGHT_WRAP = ['none', 'allLines', 'firstAndLastLine', 'firstLineOnly', 'lastLineOnly'] as const;
export const ST_TEXT_TRANSFORM = ['uppercase', 'none'] as const;
export const ST_JUSTIFICATION = ['left', 'center', 'right', 'justify', 'distribute'] as const;
export { ST_UNDERLINE_VALUES };

// ---------------------------------------------------------------------------
// Value Schema AST
// ---------------------------------------------------------------------------

/** Recursive schema AST describing the shape of a property value. */
export type ValueSchema =
  | { kind: 'boolean' }
  | { kind: 'integer'; min?: number; max?: number }
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'string' }
  | { kind: 'object'; children: Record<string, ValueSchema> }
  | { kind: 'array'; item: ValueSchema };

// ---------------------------------------------------------------------------
// Property Definition
// ---------------------------------------------------------------------------

export type StylesChannel = 'run' | 'paragraph';

export type MergeStrategy = 'replace' | 'shallowMerge' | 'edgeMerge';

export interface PropertyDefinition {
  key: string;
  channel: StylesChannel;
  schema: ValueSchema;
  mergeStrategy: MergeStrategy;
}

// ---------------------------------------------------------------------------
// Reusable Schema Fragments
// ---------------------------------------------------------------------------

const FONT_FAMILY_SCHEMA: ValueSchema = {
  kind: 'object',
  children: {
    hint: { kind: 'string' },
    ascii: { kind: 'string' },
    hAnsi: { kind: 'string' },
    eastAsia: { kind: 'string' },
    cs: { kind: 'string' },
    val: { kind: 'string' },
    asciiTheme: { kind: 'string' },
    hAnsiTheme: { kind: 'string' },
    eastAsiaTheme: { kind: 'string' },
    cstheme: { kind: 'string' },
  },
};

const COLOR_SCHEMA: ValueSchema = {
  kind: 'object',
  children: {
    val: { kind: 'string' },
    themeColor: { kind: 'string' },
    themeTint: { kind: 'string' },
    themeShade: { kind: 'string' },
  },
};

const SPACING_SCHEMA: ValueSchema = {
  kind: 'object',
  children: {
    after: { kind: 'integer' },
    afterAutospacing: { kind: 'boolean' },
    afterLines: { kind: 'integer' },
    before: { kind: 'integer' },
    beforeAutospacing: { kind: 'boolean' },
    beforeLines: { kind: 'integer' },
    line: { kind: 'integer' },
    lineRule: { kind: 'enum', values: ['auto', 'exact', 'atLeast'] },
  },
};

const INDENT_SCHEMA: ValueSchema = {
  kind: 'object',
  children: {
    end: { kind: 'integer' },
    endChars: { kind: 'integer' },
    firstLine: { kind: 'integer' },
    firstLineChars: { kind: 'integer' },
    hanging: { kind: 'integer' },
    hangingChars: { kind: 'integer' },
    left: { kind: 'integer' },
    leftChars: { kind: 'integer' },
    right: { kind: 'integer' },
    rightChars: { kind: 'integer' },
    start: { kind: 'integer' },
    startChars: { kind: 'integer' },
  },
};

const UNDERLINE_SCHEMA: ValueSchema = {
  kind: 'object',
  children: {
    val: { kind: 'enum', values: [...ST_UNDERLINE_VALUES] },
    color: { kind: 'string' },
    themeColor: { kind: 'string' },
    themeTint: { kind: 'string' },
    themeShade: { kind: 'string' },
  },
};

const BORDER_PROPERTIES_SCHEMA: ValueSchema = {
  kind: 'object',
  children: {
    val: { kind: 'string' },
    color: { kind: 'string' },
    themeColor: { kind: 'string' },
    themeTint: { kind: 'string' },
    themeShade: { kind: 'string' },
    size: { kind: 'integer' },
    space: { kind: 'integer' },
    shadow: { kind: 'boolean' },
    frame: { kind: 'boolean' },
  },
};

const SHADING_SCHEMA: ValueSchema = {
  kind: 'object',
  children: {
    color: { kind: 'string' },
    fill: { kind: 'string' },
    themeColor: { kind: 'string' },
    themeFill: { kind: 'string' },
    themeFillShade: { kind: 'string' },
    themeFillTint: { kind: 'string' },
    themeShade: { kind: 'string' },
    themeTint: { kind: 'string' },
    val: { kind: 'string' },
  },
};

const LANG_SCHEMA: ValueSchema = {
  kind: 'object',
  children: {
    val: { kind: 'string' },
    eastAsia: { kind: 'string' },
    bidi: { kind: 'string' },
  },
};

const EAST_ASIAN_LAYOUT_SCHEMA: ValueSchema = {
  kind: 'object',
  children: {
    id: { kind: 'integer' },
    combine: { kind: 'boolean' },
    combineBrackets: { kind: 'string' },
    vert: { kind: 'boolean' },
    vertCompress: { kind: 'boolean' },
  },
};

const FIT_TEXT_SCHEMA: ValueSchema = {
  kind: 'object',
  children: {
    val: { kind: 'integer' },
    id: { kind: 'integer' },
  },
};

const NUMBERING_PROPERTIES_SCHEMA: ValueSchema = {
  kind: 'object',
  children: {
    ilvl: { kind: 'integer' },
    numId: { kind: 'integer' },
  },
};

const FRAME_PR_SCHEMA: ValueSchema = {
  kind: 'object',
  children: {
    anchorLock: { kind: 'boolean' },
    dropCap: { kind: 'string' },
    h: { kind: 'integer' },
    hAnchor: { kind: 'string' },
    hRule: { kind: 'string' },
    hSpace: { kind: 'integer' },
    lines: { kind: 'integer' },
    vAnchor: { kind: 'string' },
    vSpace: { kind: 'integer' },
    w: { kind: 'integer' },
    wrap: { kind: 'string' },
    x: { kind: 'integer' },
    xAlign: { kind: 'string' },
    y: { kind: 'integer' },
    yAlign: { kind: 'string' },
  },
};

const PARAGRAPH_BORDERS_SCHEMA: ValueSchema = {
  kind: 'object',
  children: {
    top: BORDER_PROPERTIES_SCHEMA,
    bottom: BORDER_PROPERTIES_SCHEMA,
    left: BORDER_PROPERTIES_SCHEMA,
    right: BORDER_PROPERTIES_SCHEMA,
    between: BORDER_PROPERTIES_SCHEMA,
    bar: BORDER_PROPERTIES_SCHEMA,
  },
};

const TAB_STOP_SCHEMA: ValueSchema = {
  kind: 'array',
  item: {
    kind: 'object',
    children: {
      tab: {
        kind: 'object',
        children: {
          tabType: { kind: 'string' },
          pos: { kind: 'integer' },
          leader: { kind: 'string' },
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Property Registry — single source of truth for styles.apply properties
// ---------------------------------------------------------------------------

export const PROPERTY_REGISTRY: PropertyDefinition[] = [
  // -------------------------------------------------------------------------
  // Run channel
  // -------------------------------------------------------------------------

  // Booleans
  { key: 'bold', channel: 'run', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'boldCs', channel: 'run', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'italic', channel: 'run', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'iCs', channel: 'run', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'smallCaps', channel: 'run', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'strike', channel: 'run', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'dstrike', channel: 'run', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'emboss', channel: 'run', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'imprint', channel: 'run', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'outline', channel: 'run', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'shadow', channel: 'run', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'vanish', channel: 'run', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'webHidden', channel: 'run', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'specVanish', channel: 'run', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'snapToGrid', channel: 'run', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'noProof', channel: 'run', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },

  // Integers
  { key: 'fontSize', channel: 'run', schema: { kind: 'integer' }, mergeStrategy: 'replace' },
  { key: 'fontSizeCs', channel: 'run', schema: { kind: 'integer' }, mergeStrategy: 'replace' },
  { key: 'letterSpacing', channel: 'run', schema: { kind: 'integer' }, mergeStrategy: 'replace' },
  { key: 'kern', channel: 'run', schema: { kind: 'integer' }, mergeStrategy: 'replace' },
  { key: 'position', channel: 'run', schema: { kind: 'integer' }, mergeStrategy: 'replace' },
  { key: 'w', channel: 'run', schema: { kind: 'integer', min: 1, max: 600 }, mergeStrategy: 'replace' },

  // Enums
  {
    key: 'textTransform',
    channel: 'run',
    schema: { kind: 'enum', values: [...ST_TEXT_TRANSFORM] },
    mergeStrategy: 'replace',
  },
  {
    key: 'vertAlign',
    channel: 'run',
    schema: { kind: 'enum', values: [...ST_VERTICAL_ALIGN_RUN] },
    mergeStrategy: 'replace',
  },
  { key: 'em', channel: 'run', schema: { kind: 'enum', values: [...ST_EM] }, mergeStrategy: 'replace' },

  // Strings (deprecated/unconstrained)
  { key: 'effect', channel: 'run', schema: { kind: 'string' }, mergeStrategy: 'replace' },

  // Objects (shallow merge)
  { key: 'fontFamily', channel: 'run', schema: FONT_FAMILY_SCHEMA, mergeStrategy: 'shallowMerge' },
  { key: 'color', channel: 'run', schema: COLOR_SCHEMA, mergeStrategy: 'shallowMerge' },
  { key: 'underline', channel: 'run', schema: UNDERLINE_SCHEMA, mergeStrategy: 'shallowMerge' },
  { key: 'borders', channel: 'run', schema: BORDER_PROPERTIES_SCHEMA, mergeStrategy: 'shallowMerge' },
  { key: 'shading', channel: 'run', schema: SHADING_SCHEMA, mergeStrategy: 'shallowMerge' },
  { key: 'lang', channel: 'run', schema: LANG_SCHEMA, mergeStrategy: 'shallowMerge' },
  { key: 'eastAsianLayout', channel: 'run', schema: EAST_ASIAN_LAYOUT_SCHEMA, mergeStrategy: 'shallowMerge' },
  { key: 'fitText', channel: 'run', schema: FIT_TEXT_SCHEMA, mergeStrategy: 'shallowMerge' },

  // -------------------------------------------------------------------------
  // Paragraph channel
  // -------------------------------------------------------------------------

  // Booleans
  { key: 'keepLines', channel: 'paragraph', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'keepNext', channel: 'paragraph', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'widowControl', channel: 'paragraph', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'contextualSpacing', channel: 'paragraph', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'pageBreakBefore', channel: 'paragraph', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'suppressAutoHyphens', channel: 'paragraph', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'suppressLineNumbers', channel: 'paragraph', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'suppressOverlap', channel: 'paragraph', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'mirrorIndents', channel: 'paragraph', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'wordWrap', channel: 'paragraph', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'kinsoku', channel: 'paragraph', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'overflowPunct', channel: 'paragraph', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'topLinePunct', channel: 'paragraph', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'autoSpaceDE', channel: 'paragraph', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'autoSpaceDN', channel: 'paragraph', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'adjustRightInd', channel: 'paragraph', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'rightToLeft', channel: 'paragraph', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },
  { key: 'snapToGrid', channel: 'paragraph', schema: { kind: 'boolean' }, mergeStrategy: 'replace' },

  // Integers
  { key: 'outlineLvl', channel: 'paragraph', schema: { kind: 'integer', min: 0, max: 9 }, mergeStrategy: 'replace' },

  // Enums
  {
    key: 'justification',
    channel: 'paragraph',
    schema: { kind: 'enum', values: [...ST_JUSTIFICATION] },
    mergeStrategy: 'replace',
  },
  {
    key: 'textAlignment',
    channel: 'paragraph',
    schema: { kind: 'enum', values: [...ST_TEXT_ALIGNMENT] },
    mergeStrategy: 'replace',
  },
  {
    key: 'textDirection',
    channel: 'paragraph',
    schema: { kind: 'enum', values: [...ST_TEXT_DIRECTION] },
    mergeStrategy: 'replace',
  },
  {
    key: 'textboxTightWrap',
    channel: 'paragraph',
    schema: { kind: 'enum', values: [...ST_TEXTBOX_TIGHT_WRAP] },
    mergeStrategy: 'replace',
  },

  // Objects (shallow merge)
  { key: 'spacing', channel: 'paragraph', schema: SPACING_SCHEMA, mergeStrategy: 'shallowMerge' },
  { key: 'indent', channel: 'paragraph', schema: INDENT_SCHEMA, mergeStrategy: 'shallowMerge' },
  { key: 'shading', channel: 'paragraph', schema: SHADING_SCHEMA, mergeStrategy: 'shallowMerge' },
  {
    key: 'numberingProperties',
    channel: 'paragraph',
    schema: NUMBERING_PROPERTIES_SCHEMA,
    mergeStrategy: 'shallowMerge',
  },
  { key: 'framePr', channel: 'paragraph', schema: FRAME_PR_SCHEMA, mergeStrategy: 'shallowMerge' },

  // Nested objects (edge merge)
  { key: 'borders', channel: 'paragraph', schema: PARAGRAPH_BORDERS_SCHEMA, mergeStrategy: 'edgeMerge' },

  // Arrays (full replace)
  { key: 'tabStops', channel: 'paragraph', schema: TAB_STOP_SCHEMA, mergeStrategy: 'replace' },
];

// ---------------------------------------------------------------------------
// Derived Lookup Maps
// ---------------------------------------------------------------------------

/** Allowed patch keys per channel, derived from the registry. */
export const ALLOWED_KEYS_BY_CHANNEL: Record<StylesChannel, Set<string>> = {
  run: new Set(PROPERTY_REGISTRY.filter((d) => d.channel === 'run').map((d) => d.key)),
  paragraph: new Set(PROPERTY_REGISTRY.filter((d) => d.channel === 'paragraph').map((d) => d.key)),
};

/** Index for O(1) property definition lookup. */
const PROPERTY_INDEX = new Map<string, PropertyDefinition>(PROPERTY_REGISTRY.map((d) => [`${d.channel}:${d.key}`, d]));

/** Lookup a property definition by key and channel. */
export function getPropertyDefinition(key: string, channel: StylesChannel): PropertyDefinition | undefined {
  return PROPERTY_INDEX.get(`${channel}:${key}`);
}

// ---------------------------------------------------------------------------
// Excluded Keys — intentionally disallowed in Word docDefaults
// ---------------------------------------------------------------------------

export const EXCLUDED_KEYS: Record<StylesChannel, Map<string, string>> = {
  run: new Map([
    ['cs', 'w:cs'],
    ['highlight', 'w:highlight'],
    ['oMath', 'w:oMath'],
    ['rPrChange', 'w:rPrChange'],
    ['rStyle', 'w:rStyle'],
    ['rtl', 'w:rtl'],
  ]),
  paragraph: new Map([
    ['cnfStyle', 'w:cnfStyle'],
    ['divId', 'w:divId'],
    ['pPrChange', 'w:pPrChange'],
    ['pStyle', 'w:pStyle'],
    ['runProperties', 'w:pPr/w:rPr'],
    ['sectPr', 'w:sectPr'],
  ]),
};

// ---------------------------------------------------------------------------
// Target Resolution
// ---------------------------------------------------------------------------

export const XML_PATH_BY_CHANNEL: Record<StylesChannel, string> = {
  run: 'w:styles/w:docDefaults/w:rPrDefault/w:rPr',
  paragraph: 'w:styles/w:docDefaults/w:pPrDefault/w:pPr',
};
