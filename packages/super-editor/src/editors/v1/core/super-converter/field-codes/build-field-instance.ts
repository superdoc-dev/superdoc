/**
 * Build a {@link FieldInstance} from data already extracted by the OOXML
 * field preprocessor.
 *
 * This is the substrate's Phase A entry point: a pure function that takes
 * import-time inputs (already gathered by `preProcessNodesForFldChar.js`)
 * and emits the canonical durable payload. No PM, no I/O, no side effects.
 *
 * Wiring this builder into specific import paths happens at the call sites;
 * the builder itself stays generic and applies to both simple and complex
 * fields, regardless of family.
 */

import {
  createFieldId,
  type FieldFamily,
  type FieldInstance,
  type FieldSourcePart,
  type OpenXmlFragment,
} from './field-instance.js';
import { deriveParsedArgs, tokenizeInstruction } from './instruction-tokenizer.js';

export type BuildFieldInstanceArgs = {
  /** `'simple'` for `<w:fldSimple>`, `'complex'` for `<w:fldChar>` trios. */
  representation: 'simple' | 'complex';
  /** Raw instruction text. For complex fields this is the concatenation of `w:instrText` runs. */
  instructionText: string;
  /** Result content for the field, parsed XML. For complex this is the runs between separate and end; for simple it is the children of `<w:fldSimple>`. */
  resultFragments: OpenXmlFragment[];
  /** Original parsed subtree to enable passthrough export. For complex: the full begin/instr/separate/result/end span. For simple: the entire `<w:fldSimple>` element. */
  originalXml: OpenXmlFragment;
  /** `w:dirty` attribute from the source element (begin `<w:fldChar>` or `<w:fldSimple>`). */
  dirty: boolean;
  /** `w:fldLock` attribute from the source element. */
  locked: boolean;
  /** DOCX part the field originated from. */
  part: FieldSourcePart;
  /** Import-time ordinal within the part. */
  importIndex: number;
  /**
   * Optional family override. If omitted, the family is taken from the
   * tokenizer-derived `parsedArgs.family` (uppercased first identifier),
   * defaulting to `'unknown'` when the tokenizer cannot identify one.
   */
  family?: FieldFamily;
  /**
   * Optional cached plain-text denormalization of `resultFragments`. If
   * the caller has already computed the cached text it can pass it in;
   * otherwise it is left undefined and consumers may compute on demand.
   */
  cachedResultText?: string;
};

/**
 * Build a {@link FieldInstance} from import-time inputs.
 *
 * Defaults:
 *   - `id`: fresh session UUID
 *   - `family`: from `parsedArgs.family` (uppercased), or `'unknown'`
 *   - `mutation`: `{ imported: true, ...all-other-flags-false }`
 *
 * Tokenization never fails; malformed `instructionText` produces a single
 * `opaque` token and `parsedArgs.family` stays undefined (which means the
 * built-in default `'unknown'` is used).
 */
export function buildFieldInstanceFromImport(args: BuildFieldInstanceArgs): FieldInstance {
  const tokens = tokenizeInstruction(args.instructionText);
  const parsedArgs = deriveParsedArgs(tokens);
  const family: FieldFamily = args.family ?? parsedArgs.family ?? 'unknown';

  return {
    id: createFieldId(),
    representation: args.representation,
    family,
    rawInstruction: args.instructionText,
    instructionTokens: tokens,
    parsedArgs,
    resultFragments: args.resultFragments,
    cachedResultText: args.cachedResultText,
    dirty: args.dirty,
    locked: args.locked,
    mutation: {
      imported: true,
      inserted: false,
      instructionEdited: false,
      resultEdited: false,
      flagsEdited: false,
      relocated: false,
      structureEdited: false,
    },
    source: {
      originalXml: args.originalXml,
      part: args.part,
      importIndex: args.importIndex,
    },
  };
}

/**
 * Read `w:dirty` and `w:fldLock` from a parsed XML element's attributes.
 * Both are optional in the source; absent or anything other than the
 * truthy strings `"1"` / `"true"` is treated as false. This matches the
 * OOXML attribute-truthiness convention.
 *
 * Pass the begin `<w:fldChar>` element for complex fields, or the
 * `<w:fldSimple>` element for simple fields.
 */
export function readFieldFlags(element: { attributes?: Record<string, string | undefined> } | null | undefined): {
  dirty: boolean;
  locked: boolean;
} {
  const attrs = element?.attributes ?? {};
  return {
    dirty: isTruthyOoxmlBoolean(attrs['w:dirty']),
    locked: isTruthyOoxmlBoolean(attrs['w:fldLock']),
  };
}

/**
 * ECMA-376 ST_OnOff truthiness. The spec lists `1`, `true`, and `on` as
 * truthy and `0`, `false`, `off` as falsy; comparison is case-insensitive
 * because some Word builds emit `True` / `On`. `w:dirty` and `w:fldLock`
 * are ST_OnOff attributes, so all three truthy forms must be honored or
 * documents using the `on` form will round-trip with the flag dropped.
 */
function isTruthyOoxmlBoolean(value: string | undefined): boolean {
  if (value == null) return false;
  const lower = value.toLowerCase();
  return lower === '1' || lower === 'true' || lower === 'on';
}
