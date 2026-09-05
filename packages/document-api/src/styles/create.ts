/**
 * `styles.create`: define or redefine a named style in `word/styles.xml`.
 *
 * ## Why the operation exists
 *
 * Nothing in the Document API brings a named style into existence.
 * `styles.apply` writes `w:docDefaults` and is validated as such
 * (`target.scope must be "docDefaults"`); `styles.paragraph.setStyle` and
 * `setStyleRef` apply a style that is *already* in the document, by `styleId`
 * or by one of four semantic roles; `styles.getCatalog` reads. So a caller who
 * wants a "Question" or a "Quote" style has one route left: synthesize a whole
 * `.docx` and hand it to `templates.apply` — an operation whose input is
 * `{ source, bodyPolicy }` with no scope selector, so which parts of the
 * document it also adopts is decided by the shape of the synthesized package
 * rather than by the caller's request.
 *
 * `styles.create` is the missing half of `styles.getCatalog`: what the
 * catalogue can describe, this can author.
 *
 * ## Adoption semantics
 *
 * - The definition **replaces** the element. `w:pPr` and `w:rPr` end up
 *   carrying exactly the keys the input carried; an absent key is absent from
 *   the style, not inherited from a previous definition of the same id. This is
 *   why `conflictPolicy` has no `merge`: the patch types have no way to say
 *   "remove this property" (no `null`, no `'inherit'`), and the registry
 *   attaches a per-property merge strategy on a second, independent axis, so a
 *   merge would have two answers for `borders` and no answer at all for
 *   removal.
 * - `conflictPolicy` is decided on **both** `id` and `name`. Word keys its
 *   Styles gallery on `w:name`, not on `w:styleId`: two styles with distinct
 *   ids and one name are two identically-labelled gallery entries. A name that
 *   collides with a latent style is worse than cosmetic — Word resolves the
 *   name against `w:latentStyles` and can inherit `w:semiHidden` from it, so
 *   the call succeeds and the style never appears.
 * - Linked styles (`w:link`) are out of scope. A linked style is a *pair*,
 *   each half naming the other; one call cannot satisfy the first half's
 *   reference, and there is no atomic pair form here. The catalogue keeps
 *   reporting `type: 'linked'` on read.
 *
 * ## What this module does not decide
 *
 * Whether `basedOn` / `next` resolve, whether the existing style is locked,
 * whether `word/styles.xml` is present at all — all need the document, so they
 * are the adapter's to report as receipt failures. The one exception is stated
 * rather than left implicit: a `next` pointing at **the id being created** is
 * legal, and must not be reported as an unresolved reference.
 *
 * Engine-agnostic contract + execution entry point. No ProseMirror/converter
 * imports.
 */

import { DocumentApiValidationError } from '../errors.js';
import { assertNoUnknownFields, isRecord } from '../validation-primitives.js';
import type { ReceiptFailure } from '../types/receipt.js';
import type { SDHighlightColor } from '../types/sd-props.js';
import type { StylesParagraphPatch, StylesRunPatch, StylesStateMap } from './apply.js';
import { validatePatchObject } from './validation.js';

/**
 * Run properties of a named style.
 *
 * A superset of {@link StylesRunPatch}: the four properties Word forbids in
 * `w:docDefaults` and allows on a `w:style` are reachable here and nowhere
 * else. `rtl` in particular is the property that makes a run right-to-left, so
 * without it no right-to-left style could be authored through this API.
 */
export interface StyleRunPatch extends StylesRunPatch {
  /** `w:cs` — treat the run as complex-script. */
  cs?: boolean;
  /** `w:rtl` — right-to-left run. */
  rtl?: boolean;
  /** `w:oMath` — the run is part of an equation. */
  oMath?: boolean;
  /** `w:highlight` — one of the closed `ST_HighlightColor` tokens. */
  highlight?: SDHighlightColor;
}

/** What to do when a style with this `id`, or this `name`, already exists. */
export type StyleConflictPolicy = 'fail' | 'replace';

interface StylesCreateCommon {
  /** `w:styleId`. Named `id` to match {@link StyleCatalogItem.id} on read. */
  id: string;
  /** `w:name`. */
  name: string;
  /** `w:basedOn`. `null` states "based on nothing" explicitly. */
  basedOn?: string | null;
  /** `w:aliases`, one entry per alias. */
  aliases?: string[];
  /** `w:uiPriority`. Named `priority` to match the catalogue on read. */
  priority?: number | null;
  /** `w:qFormat` — offer the style in Word's quick gallery. */
  qFormat?: boolean;
  /** `w:hidden`. */
  hidden?: boolean;
  /** `w:semiHidden`. */
  semiHidden?: boolean;
  /** `w:unhideWhenUsed`. */
  unhideWhenUsed?: boolean;
  /** `w:locked`. */
  locked?: boolean;
  /**
   * `w:customStyle`. Defaults to `true`, which is what a style authored
   * through this API is. Setting it `false` on a style whose name is not a
   * built-in makes Word treat the name as one and re-label or hide the style.
   */
  custom?: boolean;
  /** Defaults to `'fail'`. */
  conflictPolicy?: StyleConflictPolicy;
}

export interface StylesCreateParagraphInput extends StylesCreateCommon {
  type: 'paragraph';
  /** `w:next`. May name the style being created. */
  next?: string | null;
  /** `w:style/w:pPr`. */
  paragraph?: StylesParagraphPatch;
  /** `w:style/w:rPr`. */
  run?: StyleRunPatch;
}

export interface StylesCreateCharacterInput extends StylesCreateCommon {
  type: 'character';
  /** A character style has no following-paragraph style. */
  next?: never;
  /** A character style has no paragraph properties. */
  paragraph?: never;
  /** `w:style/w:rPr`. */
  run?: StyleRunPatch;
}

export type StylesCreateInput = StylesCreateParagraphInput | StylesCreateCharacterInput;

export interface StylesCreateOptions {
  dryRun?: boolean;
  expectedRevision?: string;
}

export interface NormalizedStylesCreateOptions {
  dryRun: boolean;
  expectedRevision: string | undefined;
}

export interface StylesCreateResolution {
  scope: 'style';
  id: string;
  type: 'paragraph' | 'character';
  xmlPart: string;
  /**
   * Literal, not `string`: `styles.apply` pins its two paths in the published
   * schema and exports them as constants for the adapter to bind to. Without
   * the narrowing an adapter could report the more specific
   * `w:styles/w:style[@w:styleId='X']`, type-check, and then fail the schema.
   */
  xmlPath: typeof STYLE_XML_PATH;
}

/** The `w:style` element path. Predicate-free, like `XML_PATH_BY_CHANNEL`. */
export const STYLE_XML_PATH = 'w:styles/w:style';

/**
 * Per-channel state, unlike {@link StylesApplyReceipt}'s flat map.
 *
 * `styles.apply` can be flat because `resolution.channel` says which channel
 * the map describes. One `w:style` carries both at once, and `snapToGrid`,
 * `shading` and `borders` exist on both — `borders` with genuinely different
 * shapes (`w:bdr`, one border, against `w:pBdr`, six edges). Folded together
 * they would be indistinguishable.
 */
export interface StyleChannelState {
  paragraph: StylesStateMap | null;
  run: StylesStateMap | null;
}

export interface StylesCreateReceiptSuccess {
  success: true;
  /** `false` when the definition already matched the input. */
  changed: boolean;
  /**
   * `false` when an existing style was redefined under `conflictPolicy:
   * 'replace'`. `created: true` implies `changed: true`. Under `dryRun` it
   * describes what the call would have done.
   *
   * `ReceiptSuccess.inserted` / `updated` are deliberately not used: they take
   * `EntityAddress`, and a style definition is not addressable as a document
   * entity.
   */
  created: boolean;
  resolution: StylesCreateResolution;
  dryRun: boolean;
  /** `null` when the style did not exist. */
  before: StyleChannelState | null;
  after: StyleChannelState;
}

export interface StylesCreateReceiptFailure {
  success: false;
  failure: ReceiptFailure;
}

export type StylesCreateReceipt = StylesCreateReceiptSuccess | StylesCreateReceiptFailure;

export interface StylesCreateAdapter {
  create(input: StylesCreateInput, options: NormalizedStylesCreateOptions): StylesCreateReceipt;
}

export interface StylesCreateApi {
  create(input: StylesCreateInput, options?: StylesCreateOptions): StylesCreateReceipt;
}

const INPUT_ALLOWED_KEYS: ReadonlySet<string> = new Set([
  'id',
  'name',
  'type',
  'basedOn',
  'next',
  'aliases',
  'priority',
  'qFormat',
  'hidden',
  'semiHidden',
  'unhideWhenUsed',
  'locked',
  'custom',
  'paragraph',
  'run',
  'conflictPolicy',
]);

const OPTIONS_ALLOWED_KEYS: ReadonlySet<string> = new Set(['dryRun', 'expectedRevision']);

const STYLE_TYPES: ReadonlySet<string> = new Set(['paragraph', 'character']);
const CONFLICT_POLICIES: ReadonlySet<string> = new Set(['fail', 'replace']);

const BOOLEAN_FLAGS = ['qFormat', 'hidden', 'semiHidden', 'unhideWhenUsed', 'locked', 'custom'] as const;

function normalizeOptions(options?: StylesCreateOptions): NormalizedStylesCreateOptions {
  return {
    dryRun: options?.dryRun ?? false,
    expectedRevision: options?.expectedRevision,
  };
}

/**
 * An empty `run: {}` would ask the adapter to write an empty `w:rPr`, and the
 * published schema rejects it (`minProperties: 1`). `styles.apply` rejects an
 * empty patch for the same reason; omitting the channel is how you say
 * "no properties".
 */
function assertNonEmptyPatch(patch: Record<string, unknown>, field: string): void {
  if (Object.keys(patch).length === 0) {
    throw new DocumentApiValidationError('INVALID_INPUT', `${field} must include at least one property.`, { field });
  }
}

function assertNonEmptyString(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new DocumentApiValidationError('INVALID_INPUT', `${field} must be a non-empty string.`, { field, value });
  }
}

/**
 * Validates the shape of `styles.create` input.
 *
 * Deliberately shallow on identifiers: `id` is checked for "non-empty string"
 * and nothing more, exactly as `styles.paragraph.setStyleRef` checks the same
 * field. `w:styleId` is an `ST_String`, real documents carry ids with spaces,
 * and a stricter rule here would mean `setStyleRef` could apply a style that
 * `styles.create` cannot express.
 */
export function validateStylesCreateInput(input: unknown): asserts input is StylesCreateInput {
  if (!isRecord(input)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'styles.create input must be a non-null object.');
  }

  assertNoUnknownFields(input, INPUT_ALLOWED_KEYS, 'styles.create');

  assertNonEmptyString(input.id, 'id');
  assertNonEmptyString(input.name, 'name');

  if (typeof input.type !== 'string' || !STYLE_TYPES.has(input.type)) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `type must be "paragraph" or "character", got ${JSON.stringify(input.type)}.`,
      { field: 'type', value: input.type },
    );
  }
  const type = input.type as 'paragraph' | 'character';

  if (input.basedOn !== undefined && input.basedOn !== null) assertNonEmptyString(input.basedOn, 'basedOn');

  if (input.next !== undefined) {
    if (type !== 'paragraph') {
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        'next is only valid on a paragraph style; a character style has no following-paragraph style.',
        { field: 'next', value: input.next },
      );
    }
    if (input.next !== null) assertNonEmptyString(input.next, 'next');
  }

  validateAliases(input.aliases);

  if (input.priority !== undefined && input.priority !== null && !Number.isInteger(input.priority)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'priority must be an integer or null.', {
      field: 'priority',
      value: input.priority,
    });
  }

  for (const flag of BOOLEAN_FLAGS) {
    if (input[flag] !== undefined && typeof input[flag] !== 'boolean') {
      throw new DocumentApiValidationError('INVALID_INPUT', `${flag} must be a boolean.`, {
        field: flag,
        value: input[flag],
      });
    }
  }

  if (input.conflictPolicy !== undefined && !CONFLICT_POLICIES.has(input.conflictPolicy as string)) {
    throw new DocumentApiValidationError(
      'INVALID_INPUT',
      `conflictPolicy must be "fail" or "replace", got ${JSON.stringify(input.conflictPolicy)}.`,
      { field: 'conflictPolicy', value: input.conflictPolicy },
    );
  }

  if (input.paragraph !== undefined) {
    if (type !== 'paragraph') {
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        'paragraph properties are only valid on a paragraph style.',
        { field: 'paragraph', value: input.paragraph },
      );
    }
    if (!isRecord(input.paragraph)) {
      throw new DocumentApiValidationError('INVALID_INPUT', 'paragraph must be a non-null object.', {
        field: 'paragraph',
        value: input.paragraph,
      });
    }
    assertNonEmptyPatch(input.paragraph, 'paragraph');
    validatePatchObject(input.paragraph, 'paragraph', 'style', 'paragraph');
  }

  if (input.run !== undefined) {
    if (!isRecord(input.run)) {
      throw new DocumentApiValidationError('INVALID_INPUT', 'run must be a non-null object.', {
        field: 'run',
        value: input.run,
      });
    }
    assertNonEmptyPatch(input.run, 'run');
    validatePatchObject(input.run, 'run', 'style', 'run');
  }
}

/**
 * `w:aliases` is a single element carrying one comma-delimited string, so an
 * alias containing a comma is silently split into two by every consumer that
 * parses it — including Word. That is the one alias rule worth enforcing here,
 * and it is expressible as a `pattern` in the published schema.
 *
 * An alias equal to the style's own name is deliberately **not** rejected. It
 * is redundant rather than corrupting, and JSON Schema cannot compare sibling
 * fields — so the rule would live only in the validator, and a caller
 * pre-validating against the published contract (which is what the generated
 * agent artifacts are for) would get a green light and then a throw.
 */
function validateAliases(value: unknown): void {
  if (value === undefined) return;

  if (!Array.isArray(value)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'aliases must be an array of strings.', {
      field: 'aliases',
      value,
    });
  }

  const seen = new Set<string>();
  value.forEach((alias, index) => {
    assertNonEmptyString(alias, `aliases[${index}]`);
    const text = alias as string;
    if (text.includes(',')) {
      throw new DocumentApiValidationError(
        'INVALID_INPUT',
        `aliases[${index}] must not contain a comma: w:aliases is a single comma-delimited value, so "${text}" would be read back as two aliases.`,
        { field: `aliases[${index}]`, value: text },
      );
    }
    if (seen.has(text)) {
      throw new DocumentApiValidationError('INVALID_INPUT', `aliases[${index}] duplicates an earlier alias.`, {
        field: `aliases[${index}]`,
        value: text,
      });
    }
    seen.add(text);
  });
}

export function validateStylesCreateOptions(options: unknown): void {
  if (options === undefined || options === null) return;

  if (!isRecord(options)) {
    throw new DocumentApiValidationError('INVALID_INPUT', 'styles.create options must be a non-null object.');
  }

  assertNoUnknownFields(options, OPTIONS_ALLOWED_KEYS, 'styles.create options');

  if (options.dryRun !== undefined && typeof options.dryRun !== 'boolean') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'options.dryRun must be a boolean.', {
      field: 'options.dryRun',
      value: options.dryRun,
    });
  }

  if (options.expectedRevision !== undefined && typeof options.expectedRevision !== 'string') {
    throw new DocumentApiValidationError('INVALID_INPUT', 'options.expectedRevision must be a string.', {
      field: 'options.expectedRevision',
      value: options.expectedRevision,
    });
  }
}

/**
 * Executes `styles.create` using the provided adapter.
 *
 * Fails closed when the host engine has no `create` hook, the same way
 * `executeStylesGetCatalog` does for its optional catalogue hook — input is
 * validated first, so a malformed call is reported as malformed rather than as
 * an unavailable capability.
 */
export function executeStylesCreate(
  adapter: Partial<StylesCreateAdapter> | null | undefined,
  input: StylesCreateInput,
  options?: StylesCreateOptions,
): StylesCreateReceipt {
  validateStylesCreateInput(input);
  validateStylesCreateOptions(options);

  if (typeof adapter?.create !== 'function') {
    throw new DocumentApiValidationError(
      'CAPABILITY_UNAVAILABLE',
      'styles.create is not available. The host engine has not provided an adapter for this capability.',
      { operation: 'styles.create' },
    );
  }

  return adapter.create(input, normalizeOptions(options));
}
