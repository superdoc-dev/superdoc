import { DocumentApiValidationError } from '../errors.js';
import { isRecord } from '../validation-primitives.js';

export type InlinePropertyStorage = 'mark' | 'runAttribute';
export type InlinePropertyType = 'boolean' | 'string' | 'number' | 'object' | 'array';

export interface UnderlinePatch {
  style?: string | null;
  color?: string | null;
  themeColor?: string | null;
}

export interface ShadingPatch {
  fill?: string | null;
  color?: string | null;
  val?: string | null;
}

export interface BorderPatch {
  val?: string | null;
  sz?: number | null;
  color?: string | null;
  space?: number | null;
}

export interface FitTextPatch {
  val?: number | null;
  id?: string | null;
}

export interface LangPatch {
  val?: string | null;
  eastAsia?: string | null;
  bidi?: string | null;
}

export interface RFontsPatch {
  ascii?: string | null;
  hAnsi?: string | null;
  eastAsia?: string | null;
  cs?: string | null;
  asciiTheme?: string | null;
  hAnsiTheme?: string | null;
  eastAsiaTheme?: string | null;
  csTheme?: string | null;
  hint?: string | null;
}

export interface EastAsianLayoutPatch {
  id?: string | null;
  combine?: boolean | null;
  combineBrackets?: string | null;
  vert?: boolean | null;
  vertCompress?: boolean | null;
}

export interface StylisticSetPatch {
  id: number;
  val?: boolean;
}

export interface InlineRunPatch {
  bold?: boolean | null;
  italic?: boolean | null;
  strike?: boolean | null;
  dstrike?: boolean | null;
  smallCaps?: boolean | null;
  caps?: boolean | null;
  underline?: true | false | UnderlinePatch | null;
  highlight?: string | null;
  shading?: ShadingPatch | null;
  color?: string | null;
  border?: BorderPatch | null;
  outline?: boolean | null;
  shadow?: boolean | null;
  emboss?: boolean | null;
  imprint?: boolean | null;
  vertAlign?: 'superscript' | 'subscript' | 'baseline' | null;
  position?: number | null;
  rtl?: boolean | null;
  cs?: boolean | null;
  bCs?: boolean | null;
  iCs?: boolean | null;
  vanish?: boolean | null;
  webHidden?: boolean | null;
  specVanish?: boolean | null;
  snapToGrid?: boolean | null;
  oMath?: boolean | null;
  fontSize?: number | null;
  fontSizeCs?: number | null;
  letterSpacing?: number | null;
  charScale?: number | null;
  kerning?: number | null;
  fitText?: FitTextPatch | null;
  lang?: LangPatch | null;
  rStyle?: string | null;
  rFonts?: RFontsPatch | null;
  eastAsianLayout?: EastAsianLayoutPatch | null;
  em?: string | null;
  ligatures?: string | null;
  numForm?: string | null;
  numSpacing?: string | null;
  stylisticSets?: StylisticSetPatch[] | null;
  contextualAlternates?: boolean | null;
}

export type InlineRunPatchKey = keyof InlineRunPatch;

interface InlinePropertyCarrierMark {
  storage: 'mark';
  markName: 'bold' | 'italic' | 'underline' | 'strike' | 'highlight' | 'textStyle';
  textStyleAttr?: string;
}

interface InlinePropertyCarrierRunAttribute {
  storage: 'runAttribute';
  nodeName: 'run';
  runPropertyKey: string;
}

export type InlinePropertyCarrier = InlinePropertyCarrierMark | InlinePropertyCarrierRunAttribute;

export interface InlinePropertyRegistryEntry {
  key: InlineRunPatchKey;
  type: InlinePropertyType;
  ooxmlElement: string;
  storage: InlinePropertyStorage;
  tracked: boolean;
  carrier: InlinePropertyCarrier;
  schema: Record<string, unknown>;
}

const schemaBooleanOrNull = (): Record<string, unknown> => ({
  oneOf: [{ type: 'boolean' }, { type: 'null' }],
});

const schemaStringOrNull = (): Record<string, unknown> => ({
  oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }],
});

const schemaNumberOrNull = (): Record<string, unknown> => ({
  oneOf: [{ type: 'number' }, { type: 'null' }],
});

const schemaObjectOrNull = (properties: Record<string, unknown>): Record<string, unknown> => ({
  oneOf: [
    {
      type: 'object',
      properties,
      additionalProperties: false,
      minProperties: 1,
    },
    { type: 'null' },
  ],
});

const UNDERLINE_OBJECT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    style: { oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
    color: { oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
    themeColor: { oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
  },
  additionalProperties: false,
  minProperties: 1,
};

const STYLISTIC_SET_ITEM_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    id: { type: 'number' },
    val: { type: 'boolean' },
  },
  required: ['id'],
  additionalProperties: false,
};

const schemaUnderlinePatch = (): Record<string, unknown> => ({
  oneOf: [{ type: 'boolean' }, { type: 'null' }, UNDERLINE_OBJECT_SCHEMA],
});

const schemaStylisticSets = (): Record<string, unknown> => ({
  oneOf: [
    {
      type: 'array',
      items: STYLISTIC_SET_ITEM_SCHEMA,
      minItems: 1,
    },
    { type: 'null' },
  ],
});

function markCarrier(
  markName: InlinePropertyCarrierMark['markName'],
  textStyleAttr?: string,
): InlinePropertyCarrierMark {
  return { storage: 'mark', markName, textStyleAttr };
}

function runAttributeCarrier(runPropertyKey: string): InlinePropertyCarrierRunAttribute {
  return { storage: 'runAttribute', nodeName: 'run', runPropertyKey };
}

const markBoolean = (
  key: InlineRunPatchKey,
  ooxmlElement: string,
  markName: InlinePropertyCarrierMark['markName'],
): InlinePropertyRegistryEntry => ({
  key,
  type: 'boolean',
  ooxmlElement,
  storage: 'mark',
  tracked: true,
  carrier: markCarrier(markName),
  schema: schemaBooleanOrNull(),
});

const markTextStyleValue = (
  key: InlineRunPatchKey,
  type: InlinePropertyType,
  ooxmlElement: string,
  schema: Record<string, unknown>,
): InlinePropertyRegistryEntry => ({
  key,
  type,
  ooxmlElement,
  storage: 'mark',
  tracked: true,
  carrier: markCarrier('textStyle', key),
  schema,
});

const runAttribute = (
  key: InlineRunPatchKey,
  type: InlinePropertyType,
  ooxmlElement: string,
  schema: Record<string, unknown>,
  runPropertyKey?: string,
): InlinePropertyRegistryEntry => ({
  key,
  type,
  ooxmlElement,
  storage: 'runAttribute',
  tracked: false,
  carrier: runAttributeCarrier(runPropertyKey ?? key),
  schema,
});

export const INLINE_PROPERTY_REGISTRY = [
  markBoolean('bold', 'w:b', 'bold'),
  markBoolean('italic', 'w:i', 'italic'),
  markBoolean('strike', 'w:strike', 'strike'),
  {
    key: 'underline',
    type: 'object',
    ooxmlElement: 'w:u',
    storage: 'mark',
    tracked: true,
    carrier: markCarrier('underline'),
    schema: schemaUnderlinePatch(),
  },
  {
    key: 'highlight',
    type: 'string',
    ooxmlElement: 'w:highlight',
    storage: 'mark',
    tracked: true,
    carrier: markCarrier('highlight'),
    schema: schemaStringOrNull(),
  },
  markTextStyleValue('color', 'string', 'w:color', schemaStringOrNull()),
  markTextStyleValue('fontSize', 'number', 'w:sz', schemaNumberOrNull()),
  markTextStyleValue('letterSpacing', 'number', 'w:spacing', schemaNumberOrNull()),
  markTextStyleValue('vertAlign', 'string', 'w:vertAlign', {
    oneOf: [{ enum: ['superscript', 'subscript', 'baseline'] }, { type: 'null' }],
  }),
  markTextStyleValue('position', 'number', 'w:position', schemaNumberOrNull()),
  runAttribute('dstrike', 'boolean', 'w:dstrike', schemaBooleanOrNull()),
  runAttribute('smallCaps', 'boolean', 'w:smallCaps', schemaBooleanOrNull()),
  runAttribute('caps', 'boolean', 'w:caps', schemaBooleanOrNull()),
  runAttribute(
    'shading',
    'object',
    'w:shd',
    schemaObjectOrNull({
      fill: { oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
      color: { oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
      val: { oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
    }),
  ),
  runAttribute(
    'border',
    'object',
    'w:bdr',
    schemaObjectOrNull({
      val: { oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
      sz: { oneOf: [{ type: 'number' }, { type: 'null' }] },
      color: { oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
      space: { oneOf: [{ type: 'number' }, { type: 'null' }] },
    }),
    'borders',
  ),
  runAttribute('outline', 'boolean', 'w:outline', schemaBooleanOrNull()),
  runAttribute('shadow', 'boolean', 'w:shadow', schemaBooleanOrNull()),
  runAttribute('emboss', 'boolean', 'w:emboss', schemaBooleanOrNull()),
  runAttribute('imprint', 'boolean', 'w:imprint', schemaBooleanOrNull()),
  runAttribute('charScale', 'number', 'w:w', schemaNumberOrNull(), 'w'),
  runAttribute('kerning', 'number', 'w:kern', schemaNumberOrNull(), 'kern'),
  runAttribute('vanish', 'boolean', 'w:vanish', schemaBooleanOrNull()),
  runAttribute('webHidden', 'boolean', 'w:webHidden', schemaBooleanOrNull()),
  runAttribute('specVanish', 'boolean', 'w:specVanish', schemaBooleanOrNull()),
  runAttribute('rtl', 'boolean', 'w:rtl', schemaBooleanOrNull()),
  runAttribute('cs', 'boolean', 'w:cs', schemaBooleanOrNull()),
  runAttribute('bCs', 'boolean', 'w:bCs', schemaBooleanOrNull(), 'boldCs'),
  runAttribute('iCs', 'boolean', 'w:iCs', schemaBooleanOrNull()),
  runAttribute(
    'eastAsianLayout',
    'object',
    'w:eastAsianLayout',
    schemaObjectOrNull({
      id: { oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
      combine: { oneOf: [{ type: 'boolean' }, { type: 'null' }] },
      combineBrackets: { oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
      vert: { oneOf: [{ type: 'boolean' }, { type: 'null' }] },
      vertCompress: { oneOf: [{ type: 'boolean' }, { type: 'null' }] },
    }),
  ),
  runAttribute('em', 'string', 'w:em', schemaStringOrNull()),
  runAttribute(
    'fitText',
    'object',
    'w:fitText',
    schemaObjectOrNull({
      val: { oneOf: [{ type: 'number' }, { type: 'null' }] },
      id: { oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
    }),
  ),
  runAttribute('snapToGrid', 'boolean', 'w:snapToGrid', schemaBooleanOrNull()),
  runAttribute(
    'lang',
    'object',
    'w:lang',
    schemaObjectOrNull({
      val: { oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
      eastAsia: { oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
      bidi: { oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
    }),
  ),
  runAttribute('oMath', 'boolean', 'w:oMath', schemaBooleanOrNull()),
  runAttribute('rStyle', 'string', 'w:rStyle', schemaStringOrNull(), 'styleId'),
  runAttribute(
    'rFonts',
    'object',
    'w:rFonts',
    schemaObjectOrNull({
      ascii: { oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
      hAnsi: { oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
      eastAsia: { oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
      cs: { oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
      asciiTheme: { oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
      hAnsiTheme: { oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
      eastAsiaTheme: { oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
      csTheme: { oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
      hint: { oneOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
    }),
    'fontFamily',
  ),
  runAttribute('fontSizeCs', 'number', 'w:szCs', schemaNumberOrNull()),
  runAttribute('ligatures', 'string', 'w14:ligatures', schemaStringOrNull()),
  runAttribute('numForm', 'string', 'w14:numForm', schemaStringOrNull()),
  runAttribute('numSpacing', 'string', 'w14:numSpacing', schemaStringOrNull()),
  runAttribute('stylisticSets', 'array', 'w14:stylisticSets', schemaStylisticSets()),
  runAttribute('contextualAlternates', 'boolean', 'w14:cntxtAlts', schemaBooleanOrNull()),
] as const satisfies readonly InlinePropertyRegistryEntry[];

export const INLINE_PROPERTY_KEY_SET: ReadonlySet<string> = new Set(INLINE_PROPERTY_REGISTRY.map((entry) => entry.key));

export const INLINE_PROPERTY_BY_KEY: Readonly<Record<InlineRunPatchKey, InlinePropertyRegistryEntry>> =
  Object.fromEntries(INLINE_PROPERTY_REGISTRY.map((entry) => [entry.key, entry])) as Record<
    InlineRunPatchKey,
    InlinePropertyRegistryEntry
  >;

export const INLINE_PROPERTY_KEYS_BY_STORAGE: Readonly<Record<InlinePropertyStorage, readonly InlineRunPatchKey[]>> = {
  mark: INLINE_PROPERTY_REGISTRY.filter((entry) => entry.storage === 'mark').map((entry) => entry.key),
  runAttribute: INLINE_PROPERTY_REGISTRY.filter((entry) => entry.storage === 'runAttribute').map((entry) => entry.key),
};

const UNDERLINE_OBJECT_ALLOWED_KEYS = new Set(['style', 'color', 'themeColor']);
const SHADING_ALLOWED_KEYS = new Set(['fill', 'color', 'val']);
const BORDER_ALLOWED_KEYS = new Set(['val', 'sz', 'color', 'space']);
const FIT_TEXT_ALLOWED_KEYS = new Set(['val', 'id']);
const LANG_ALLOWED_KEYS = new Set(['val', 'eastAsia', 'bidi']);
const RFONTS_ALLOWED_KEYS = new Set([
  'ascii',
  'hAnsi',
  'eastAsia',
  'cs',
  'asciiTheme',
  'hAnsiTheme',
  'eastAsiaTheme',
  'csTheme',
  'hint',
]);
const EAST_ASIAN_LAYOUT_ALLOWED_KEYS = new Set(['id', 'combine', 'combineBrackets', 'vert', 'vertCompress']);
const STYLISTIC_SET_ALLOWED_KEYS = new Set(['id', 'val']);
const VERT_ALIGN_VALUES = new Set(['superscript', 'subscript', 'baseline']);

function isObjectPatch(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && !Array.isArray(value);
}

function assertNonEmptyObject(value: Record<string, unknown>, propertyKey: string): void {
  if (Object.keys(value).length === 0) {
    throw new DocumentApiValidationError('INVALID_INPUT', `inline.${propertyKey} object must not be empty.`, {
      field: `inline.${propertyKey}`,
    });
  }
}

function assertAllowedObjectKeys(
  objectValue: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
  propertyKey: string,
): void {
  for (const key of Object.keys(objectValue)) {
    if (!allowedKeys.has(key)) {
      throw new DocumentApiValidationError('INVALID_INPUT', `Unknown inline.${propertyKey} key "${key}".`, {
        field: `inline.${propertyKey}.${key}`,
      });
    }
  }
}

function assertStringOrNull(value: unknown, field: string): void {
  if (value === null || value === undefined) return;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DocumentApiValidationError('INVALID_INPUT', `${field} must be a non-empty string or null.`, {
      field,
      value,
    });
  }
}

function assertBooleanOrNull(value: unknown, field: string): void {
  if (value === null || value === undefined) return;
  if (typeof value !== 'boolean') {
    throw new DocumentApiValidationError('INVALID_INPUT', `${field} must be boolean or null.`, {
      field,
      value,
    });
  }
}

function assertNumberOrNull(value: unknown, field: string): void {
  if (value === null || value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new DocumentApiValidationError('INVALID_INPUT', `${field} must be a finite number or null.`, {
      field,
      value,
    });
  }
}

function assertVertAlignOrNull(value: unknown, field: string): void {
  if (value === null || value === undefined) return;
  if (typeof value !== 'string' || !VERT_ALIGN_VALUES.has(value)) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `${field} must be one of superscript, subscript, baseline, or null.`,
      {
        field,
        value,
      },
    );
  }
}

function validateUnderlinePatch(value: unknown): void {
  if (value === null || typeof value === 'boolean') return;
  if (!isObjectPatch(value)) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      'inline.underline must be true/false/null or an object patch.',
      {
        field: 'inline.underline',
        value,
      },
    );
  }
  assertNonEmptyObject(value, 'underline');
  assertAllowedObjectKeys(value, UNDERLINE_OBJECT_ALLOWED_KEYS, 'underline');
  assertStringOrNull(value.style, 'inline.underline.style');
  assertStringOrNull(value.color, 'inline.underline.color');
  assertStringOrNull(value.themeColor, 'inline.underline.themeColor');
}

function validateObjectPatch(
  value: unknown,
  propertyKey: string,
  allowedKeys: ReadonlySet<string>,
  validators: Record<string, (value: unknown, field: string) => void>,
): void {
  if (value === null) return;
  if (!isObjectPatch(value)) {
    throw new DocumentApiValidationError('INVALID_INPUT', `inline.${propertyKey} must be an object or null.`, {
      field: `inline.${propertyKey}`,
      value,
    });
  }

  assertNonEmptyObject(value, propertyKey);
  assertAllowedObjectKeys(value, allowedKeys, propertyKey);

  for (const key of Object.keys(value)) {
    const validator = validators[key];
    if (validator) validator(value[key], `inline.${propertyKey}.${key}`);
  }
}

function validateStylisticSets(value: unknown): void {
  if (value === null) return;
  if (!Array.isArray(value)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'inline.stylisticSets must be an array or null.', {
      field: 'inline.stylisticSets',
      value,
    });
  }
  if (value.length === 0) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'inline.stylisticSets array must not be empty.', {
      field: 'inline.stylisticSets',
    });
  }

  value.forEach((item, index) => {
    if (!isObjectPatch(item)) {
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        `inline.stylisticSets[${index}] must be an object with id/val fields.`,
        {
          field: `inline.stylisticSets[${index}]`,
          value: item,
        },
      );
    }
    assertAllowedObjectKeys(item, STYLISTIC_SET_ALLOWED_KEYS, `stylisticSets[${index}]`);
    if (typeof item.id !== 'number' || !Number.isFinite(item.id)) {
      throw new DocumentApiValidationError('INVALID_INPUT', `inline.stylisticSets[${index}].id must be a number.`, {
        field: `inline.stylisticSets[${index}].id`,
        value: item.id,
      });
    }
    if (item.val !== undefined && typeof item.val !== 'boolean') {
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        `inline.stylisticSets[${index}].val must be boolean when provided.`,
        {
          field: `inline.stylisticSets[${index}].val`,
          value: item.val,
        },
      );
    }
  });
}

function validateInlineProperty(key: string, value: unknown): void {
  switch (key as InlineRunPatchKey) {
    case 'bold':
    case 'italic':
    case 'strike':
    case 'dstrike':
    case 'smallCaps':
    case 'caps':
    case 'outline':
    case 'shadow':
    case 'emboss':
    case 'imprint':
    case 'rtl':
    case 'cs':
    case 'bCs':
    case 'iCs':
    case 'vanish':
    case 'webHidden':
    case 'specVanish':
    case 'snapToGrid':
    case 'oMath':
    case 'contextualAlternates':
      assertBooleanOrNull(value, `inline.${key}`);
      return;
    case 'underline':
      validateUnderlinePatch(value);
      return;
    case 'highlight':
    case 'color':
    case 'rStyle':
    case 'em':
    case 'ligatures':
    case 'numForm':
    case 'numSpacing':
      assertStringOrNull(value, `inline.${key}`);
      return;
    case 'fontSize':
    case 'fontSizeCs':
    case 'letterSpacing':
    case 'charScale':
    case 'kerning':
    case 'position':
      assertNumberOrNull(value, `inline.${key}`);
      return;
    case 'vertAlign':
      assertVertAlignOrNull(value, 'inline.vertAlign');
      return;
    case 'shading':
      validateObjectPatch(value, 'shading', SHADING_ALLOWED_KEYS, {
        fill: assertStringOrNull,
        color: assertStringOrNull,
        val: assertStringOrNull,
      });
      return;
    case 'border':
      validateObjectPatch(value, 'border', BORDER_ALLOWED_KEYS, {
        val: assertStringOrNull,
        color: assertStringOrNull,
        sz: assertNumberOrNull,
        space: assertNumberOrNull,
      });
      return;
    case 'fitText':
      validateObjectPatch(value, 'fitText', FIT_TEXT_ALLOWED_KEYS, {
        val: assertNumberOrNull,
        id: assertStringOrNull,
      });
      return;
    case 'lang':
      validateObjectPatch(value, 'lang', LANG_ALLOWED_KEYS, {
        val: assertStringOrNull,
        eastAsia: assertStringOrNull,
        bidi: assertStringOrNull,
      });
      return;
    case 'rFonts':
      validateObjectPatch(value, 'rFonts', RFONTS_ALLOWED_KEYS, {
        ascii: assertStringOrNull,
        hAnsi: assertStringOrNull,
        eastAsia: assertStringOrNull,
        cs: assertStringOrNull,
        asciiTheme: assertStringOrNull,
        hAnsiTheme: assertStringOrNull,
        eastAsiaTheme: assertStringOrNull,
        csTheme: assertStringOrNull,
        hint: assertStringOrNull,
      });
      return;
    case 'eastAsianLayout':
      validateObjectPatch(value, 'eastAsianLayout', EAST_ASIAN_LAYOUT_ALLOWED_KEYS, {
        id: assertStringOrNull,
        combine: assertBooleanOrNull,
        combineBrackets: assertStringOrNull,
        vert: assertBooleanOrNull,
        vertCompress: assertBooleanOrNull,
      });
      return;
    case 'stylisticSets':
      validateStylisticSets(value);
      return;
    default:
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        `Unknown inline style key "${key}". Known keys are defined by INLINE_PROPERTY_REGISTRY.`,
        {
          field: 'inline',
          key,
        },
      );
  }
}

export function validateInlineRunPatch(patch: unknown): asserts patch is InlineRunPatch {
  if (!isObjectPatch(patch)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'inline must be a non-null object.', {
      field: 'inline',
      value: patch,
    });
  }

  const keys = Object.keys(patch);
  if (keys.length === 0) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'inline must include at least one known key.');
  }

  for (const key of keys) {
    if (!INLINE_PROPERTY_KEY_SET.has(key)) {
      throw new DocumentApiValidationError('INVALID_INPUT', `Unknown inline style key "${key}".`, {
        field: 'inline',
        key,
      });
    }
    validateInlineProperty(key, patch[key]);
  }
}

export function buildInlineRunPatchSchema(): Record<string, unknown> {
  const properties = Object.fromEntries(INLINE_PROPERTY_REGISTRY.map((entry) => [entry.key, entry.schema]));
  return {
    type: 'object',
    properties,
    additionalProperties: false,
    minProperties: 1,
  };
}
